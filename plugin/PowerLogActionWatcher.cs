using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using HDTBgTracker.Models;
using Hearthstone_Deck_Tracker;

namespace HDTBgTracker
{
    public sealed class PowerLogAction
    {
        public TrackerActionEvent Event { get; set; } = new TrackerActionEvent();
        public PurchaseEvent? Purchase { get; set; }
        public UpgradeEvent? Upgrade { get; set; }
    }

    public sealed class PowerLogActionWatcher
    {
        private static readonly Regex BlockStartRegex = new Regex(
            @"BLOCK_START BlockType=PLAY Entity=\[entityName=(?<sourceName>.*?) id=(?<sourceId>\d+) zone=(?<sourceZone>\S+) zonePos=(?<sourceZonePos>-?\d+) cardId=(?<sourceCardId>\S+) player=(?<sourcePlayer>\d+)\].*?Target=(?<target>0|\[entityName=.*?\])",
            RegexOptions.Compiled);

        private static readonly Regex TargetRegex = new Regex(
            @"\[entityName=(?<name>.*?) id=(?<id>\d+) zone=(?<zone>\S+) zonePos=(?<zonePos>-?\d+) cardId=(?<cardId>\S+) player=(?<player>\d+)\]",
            RegexOptions.Compiled);

        private static readonly Regex ZoneToHandRegex = new Regex(
            @"TAG_CHANGE Entity=\[entityName=(?<name>.*?) id=(?<id>\d+) zone=(?<fromZone>\S+) zonePos=(?<zonePos>-?\d+) cardId=(?<cardId>\S+) player=(?<player>\d+)\] tag=ZONE value=HAND",
            RegexOptions.Compiled);

        private static readonly Regex HeroZoneToPlayRegex = new Regex(
            @"TAG_CHANGE Entity=\[entityName=(?<name>.*?) id=(?<id>\d+) zone=(?<fromZone>\S+) zonePos=(?<zonePos>-?\d+) cardId=(?<cardId>\S+) player=(?<player>\d+)\] tag=ZONE value=PLAY",
            RegexOptions.Compiled);

        private static readonly Regex HeroLeaderboardRegex = new Regex(
            @"TAG_CHANGE Entity=\[entityName=(?<name>.*?) id=(?<id>\d+) zone=(?<fromZone>\S+) zonePos=(?<zonePos>-?\d+) cardId=(?<cardId>\S+) player=(?<player>\d+)\] tag=PLAYER_LEADERBOARD_PLACE value=\d+",
            RegexOptions.Compiled);

        private string? _filePath;
        private long _offset;
        private string _pending = "";
        private DateTime _nextScanUtc;

        public void ResetToLatestLogEnd()
        {
            _filePath = FindLatestPowerLog();
            _offset = _filePath != null && File.Exists(_filePath) ? new FileInfo(_filePath).Length : 0;
            _pending = "";
            _nextScanUtc = DateTime.UtcNow.AddSeconds(2);
            Logging.Info("Power log watcher reset at " + (_filePath ?? "no Power.log"));
        }

        public IReadOnlyList<PowerLogAction> Drain(int turnNumber, int playerId)
        {
            var path = ResolveCurrentPowerLog();
            if (path == null || playerId <= 0)
            {
                return Array.Empty<PowerLogAction>();
            }

            if (!string.Equals(path, _filePath, StringComparison.OrdinalIgnoreCase))
            {
                _filePath = path;
                _offset = 0;
                _pending = "";
            }

            var info = new FileInfo(path);
            if (info.Length < _offset)
            {
                _offset = 0;
                _pending = "";
            }
            if (info.Length == _offset)
            {
                return Array.Empty<PowerLogAction>();
            }

            var lines = ReadNewLines(path, info.Length);
            var actions = new List<PowerLogAction>();
            foreach (var line in lines)
            {
                var action = ParseLine(line, turnNumber, playerId);
                if (action != null)
                {
                    actions.Add(action);
                }
            }
            return actions;
        }

        private string? ResolveCurrentPowerLog()
        {
            if (_filePath != null && File.Exists(_filePath) && DateTime.UtcNow < _nextScanUtc)
            {
                return _filePath;
            }
            _nextScanUtc = DateTime.UtcNow.AddSeconds(2);
            return FindLatestPowerLog();
        }

        private IEnumerable<string> ReadNewLines(string path, long length)
        {
            using (var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
            {
                stream.Seek(_offset, SeekOrigin.Begin);
                var count = checked((int)(length - _offset));
                var buffer = new byte[count];
                var read = stream.Read(buffer, 0, buffer.Length);
                _offset += read;
                var text = _pending + Encoding.UTF8.GetString(buffer, 0, read);
                var normalized = text.Replace("\r\n", "\n").Replace('\r', '\n');
                var parts = normalized.Split('\n');
                if (!normalized.EndsWith("\n", StringComparison.Ordinal))
                {
                    _pending = parts.LastOrDefault() ?? "";
                    parts = parts.Take(Math.Max(0, parts.Length - 1)).ToArray();
                }
                else
                {
                    _pending = "";
                }
                return parts.Where(x => x.Length > 0).ToArray();
            }
        }

        private PowerLogAction? ParseLine(string line, int turnNumber, int playerId)
        {
            if (!line.Contains("GameState.DebugPrintPower()"))
            {
                return null;
            }

            var block = BlockStartRegex.Match(line);
            if (block.Success)
            {
                return ParseBlockStart(block, line, turnNumber, playerId);
            }

            var selectedHero = HeroZoneToPlayRegex.Match(line);
            if (selectedHero.Success && ReadInt(selectedHero, "player") == playerId && IsLikelyHeroCardId(selectedHero.Groups["cardId"].Value))
            {
                return HeroSelectedAction(selectedHero, line, turnNumber, "power-log:hero-zone-play");
            }

            var leaderboardHero = HeroLeaderboardRegex.Match(line);
            if (leaderboardHero.Success && ReadInt(leaderboardHero, "player") == playerId && IsLikelyHeroCardId(leaderboardHero.Groups["cardId"].Value))
            {
                return HeroSelectedAction(leaderboardHero, line, turnNumber, "power-log:hero-leaderboard");
            }

            var gained = ZoneToHandRegex.Match(line);
            if (gained.Success && ReadInt(gained, "player") == playerId && IsInterestingCard(gained.Groups["cardId"].Value))
            {
                var cardId = gained.Groups["cardId"].Value;
                var cardName = gained.Groups["name"].Value;
                return new PowerLogAction
                {
                    Event = new TrackerActionEvent
                    {
                        TurnNumber = turnNumber,
                        EventType = "card-gained",
                        CardId = cardId,
                        CardName = ResolveCardName(cardId, cardName),
                        EntityId = ReadInt(gained, "id"),
                        Source = "power-log:zone-to-hand",
                        RawJson = Raw(line)
                    }
                };
            }

            return null;
        }

        private static PowerLogAction HeroSelectedAction(Match match, string line, int turnNumber, string source)
        {
            var cardId = match.Groups["cardId"].Value;
            var cardName = ResolveCardName(cardId, match.Groups["name"].Value);
            return new PowerLogAction
            {
                Event = new TrackerActionEvent
                {
                    TurnNumber = turnNumber,
                    EventType = "hero-selected",
                    CardId = cardId,
                    CardName = cardName,
                    EntityId = ReadInt(match, "id"),
                    Source = source,
                    RawJson = Raw(line)
                }
            };
        }

        private PowerLogAction? ParseBlockStart(Match block, string line, int turnNumber, int playerId)
        {
            var sourceCardId = block.Groups["sourceCardId"].Value;
            var sourceName = block.Groups["sourceName"].Value;
            var sourceEntityId = ReadInt(block, "sourceId");
            var sourcePlayer = ReadInt(block, "sourcePlayer");
            var target = TargetRegex.Match(block.Groups["target"].Value);

            if (sourceCardId == "TB_BaconShop_DragBuy" || sourceCardId == "TB_BaconShop_DragBuy_Spell")
            {
                if (!target.Success)
                {
                    return null;
                }
                if (!IsLocalShopAction(sourcePlayer, target, playerId))
                {
                    return null;
                }
                var cardId = target.Groups["cardId"].Value;
                var cardName = ResolveCardName(cardId, target.Groups["name"].Value);
                var purchase = new PurchaseEvent
                {
                    TurnNumber = turnNumber,
                    CardId = cardId,
                    CardName = cardName,
                    Tier = ResolveTier(cardId),
                    GoldPaid = 3,
                    Source = sourceCardId == "TB_BaconShop_DragBuy_Spell" ? "power-log:drag-buy-spell" : "power-log:drag-buy"
                };
                return new PowerLogAction
                {
                    Purchase = purchase,
                    Event = new TrackerActionEvent
                    {
                        TurnNumber = turnNumber,
                        EventType = "purchase",
                        CardId = cardId,
                        CardName = cardName,
                        EntityId = sourceEntityId,
                        TargetCardId = cardId,
                        TargetName = cardName,
                        TargetEntityId = ReadInt(target, "id"),
                        Source = purchase.Source,
                        RawJson = Raw(line)
                    }
                };
            }

            if (sourceCardId == "TB_BaconShop_DragSell")
            {
                if (!target.Success)
                {
                    return null;
                }
                if (!IsLocalShopAction(sourcePlayer, target, playerId))
                {
                    return null;
                }
                var cardId = target.Groups["cardId"].Value;
                var cardName = ResolveCardName(cardId, target.Groups["name"].Value);
                return new PowerLogAction
                {
                    Event = new TrackerActionEvent
                    {
                        TurnNumber = turnNumber,
                        EventType = "sell",
                        CardId = cardId,
                        CardName = cardName,
                        EntityId = sourceEntityId,
                        TargetCardId = cardId,
                        TargetName = cardName,
                        TargetEntityId = ReadInt(target, "id"),
                        Source = "power-log:drag-sell",
                        RawJson = Raw(line)
                    }
                };
            }

            if (sourceCardId == "TB_BaconShop_8p_Reroll_Button")
            {
                return SimpleAction("refresh", sourceCardId, sourceName, sourceEntityId, turnNumber, line, "power-log:reroll");
            }

            var upgradeTier = ParseUpgradeTier(sourceCardId);
            if (upgradeTier > 1)
            {
                return new PowerLogAction
                {
                    Upgrade = new UpgradeEvent
                    {
                        TurnNumber = turnNumber,
                        FromTier = Math.Max(1, upgradeTier - 1),
                        ToTier = upgradeTier,
                        GoldPaid = 0
                    },
                    Event = new TrackerActionEvent
                    {
                        TurnNumber = turnNumber,
                        EventType = "tavern-upgrade",
                        CardId = sourceCardId,
                        CardName = ResolveCardName(sourceCardId, sourceName),
                        EntityId = sourceEntityId,
                        Source = "power-log:tech-up",
                        RawJson = Raw(line)
                    }
                };
            }

            if (sourcePlayer == playerId && block.Groups["sourceZone"].Value == "HAND" && IsInterestingCard(sourceCardId))
            {
                var evt = new TrackerActionEvent
                {
                    TurnNumber = turnNumber,
                    EventType = "play",
                    CardId = sourceCardId,
                    CardName = ResolveCardName(sourceCardId, sourceName),
                    EntityId = sourceEntityId,
                    Source = "power-log:hand-play",
                    RawJson = Raw(line)
                };
                if (target.Success)
                {
                    evt.TargetCardId = target.Groups["cardId"].Value;
                    evt.TargetName = ResolveCardName(evt.TargetCardId, target.Groups["name"].Value);
                    evt.TargetEntityId = ReadInt(target, "id");
                }
                return new PowerLogAction { Event = evt };
            }

            return null;
        }

        private static bool IsLocalShopAction(int sourcePlayer, Match target, int playerId)
        {
            if (sourcePlayer == playerId) return true;
            return target.Success && ReadInt(target, "player") == playerId;
        }

        private static PowerLogAction SimpleAction(string type, string cardId, string name, int entityId, int turnNumber, string line, string source)
        {
            return new PowerLogAction
            {
                Event = new TrackerActionEvent
                {
                    TurnNumber = turnNumber,
                    EventType = type,
                    CardId = cardId,
                    CardName = ResolveCardName(cardId, name),
                    EntityId = entityId,
                    Source = source,
                    RawJson = Raw(line)
                }
            };
        }

        private static int ParseUpgradeTier(string cardId)
        {
            var match = Regex.Match(cardId, @"TB_BaconShopTechUp0?(?<tier>\d+)_Button", RegexOptions.IgnoreCase);
            return match.Success && int.TryParse(match.Groups["tier"].Value, out var tier) ? tier : 0;
        }

        private static string? FindLatestPowerLog()
        {
            var logRoot = GetLogRoot();
            if (string.IsNullOrWhiteSpace(logRoot) || !Directory.Exists(logRoot))
            {
                return null;
            }

            return Directory.EnumerateFiles(logRoot, "Power*.log", SearchOption.AllDirectories)
                .Select(path => new FileInfo(path))
                .Where(file => file.Exists)
                .OrderByDescending(file => file.LastWriteTimeUtc)
                .FirstOrDefault()
                ?.FullName;
        }

        private static string? GetLogRoot()
        {
            try
            {
                var hsDir = Config.Instance.HearthstoneDirectory;
                var logsName = Config.Instance.HearthstoneLogsDirectoryName;
                if (!string.IsNullOrWhiteSpace(hsDir))
                {
                    return Path.Combine(hsDir, string.IsNullOrWhiteSpace(logsName) ? "Logs" : logsName);
                }
            }
            catch
            {
                // Fall back to config.xml below.
            }

            try
            {
                var configPath = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                    "HearthstoneDeckTracker",
                    "config.xml");
                if (!File.Exists(configPath)) return null;
                var text = File.ReadAllText(configPath);
                var hsDir = Regex.Match(text, @"<HearthstoneDirectory>(?<value>.*?)</HearthstoneDirectory>").Groups["value"].Value;
                var logsName = Regex.Match(text, @"<HearthstoneLogsDirectoryName>(?<value>.*?)</HearthstoneLogsDirectoryName>").Groups["value"].Value;
                hsDir = System.Net.WebUtility.HtmlDecode(hsDir);
                logsName = System.Net.WebUtility.HtmlDecode(logsName);
                return string.IsNullOrWhiteSpace(hsDir) ? null : Path.Combine(hsDir, string.IsNullOrWhiteSpace(logsName) ? "Logs" : logsName);
            }
            catch
            {
                return null;
            }
        }

        private static bool IsInterestingCard(string cardId)
        {
            if (string.IsNullOrWhiteSpace(cardId)) return false;
            return cardId.StartsWith("BG", StringComparison.OrdinalIgnoreCase)
                || cardId.StartsWith("TB_BaconShop", StringComparison.OrdinalIgnoreCase)
                || cardId.StartsWith("EBG", StringComparison.OrdinalIgnoreCase)
                || cardId.StartsWith("BGS", StringComparison.OrdinalIgnoreCase);
        }

        private static bool IsLikelyHeroCardId(string cardId)
        {
            if (string.IsNullOrWhiteSpace(cardId)) return false;
            return cardId.IndexOf("HERO", StringComparison.OrdinalIgnoreCase) >= 0
                && cardId.IndexOf("HERO_PH", StringComparison.OrdinalIgnoreCase) < 0
                && cardId.IndexOf("_Buddy", StringComparison.OrdinalIgnoreCase) < 0;
        }

        private static int ResolveTier(string cardId)
        {
            var card = Hearthstone_Deck_Tracker.Hearthstone.Database.GetCardFromId(cardId);
            return Math.Max(0, card?.TechLevel ?? 0);
        }

        private static string ResolveCardName(string cardId, string fallback)
        {
            var card = Hearthstone_Deck_Tracker.Hearthstone.Database.GetCardFromId(cardId);
            if (!string.IsNullOrWhiteSpace(card?.LocalizedName)) return card!.LocalizedName!;
            if (!string.IsNullOrWhiteSpace(card?.Name)) return card!.Name!;
            if (!string.IsNullOrWhiteSpace(fallback)) return fallback;
            return cardId;
        }

        private static int ReadInt(Match match, string group)
        {
            return int.TryParse(match.Groups[group].Value, out var value) ? value : 0;
        }

        private static string Raw(string line)
        {
            return Newtonsoft.Json.JsonConvert.SerializeObject(new { line });
        }
    }
}
