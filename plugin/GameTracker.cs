using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Threading.Tasks;
using System.Timers;
using HDTBgTracker.Models;
using Hearthstone_Deck_Tracker.API;
using Hearthstone_Deck_Tracker.Enums;
using HearthDb.Enums;
using Newtonsoft.Json;
using HdtCore = Hearthstone_Deck_Tracker.Core;
using HdtCard = Hearthstone_Deck_Tracker.Hearthstone.Card;

namespace HDTBgTracker
{
    public sealed class GameTracker : IDisposable
    {
        private readonly DataStore _store;
        private readonly Timer _pollTimer;
        private readonly ShopWatcher _shopWatcher = new ShopWatcher();
        private readonly PowerLogActionWatcher _powerLogActionWatcher = new PowerLogActionWatcher();
        private readonly object _sync = new object();
        private readonly HashSet<string> _trinketKeys = new HashSet<string>();
        private readonly HashSet<string> _eventKeys = new HashSet<string>();
        private GameRecord? _current;
        private int _lastTurn;
        private bool _ending;
        private bool _polling;

        public GameTracker(DataStore store)
        {
            _store = store;
            _pollTimer = new Timer(250);
            _pollTimer.Elapsed += (_, __) => Poll();
        }

        public void Start()
        {
            GameEvents.OnGameStart.Add(OnGameStart);
            GameEvents.OnGameEnd.Add(OnGameEnd);
            GameEvents.OnTurnStart.Add(OnTurnStart);
            GameEvents.OnPlayerGet.Add(card => CaptureCardEvent("player-get", card));
            GameEvents.OnPlayerPlay.Add(card => CaptureCardEvent("player-play", card));
            GameEvents.OnPlayerPlayToHand.Add(card => CaptureCardEvent("player-play-to-hand", card));
            GameEvents.OnPlayerCreateInPlay.Add(card => CaptureCardEvent("player-create-in-play", card));
            _pollTimer.Start();
            Logging.Info("GameTracker started");
        }

        public void Dispose()
        {
            _pollTimer.Stop();
        }

        private void OnGameStart()
        {
            try
            {
                if (!IsBattlegrounds()) return;
                lock (_sync)
                {
                    if (_current != null && !_ending)
                    {
                        Logging.Info("Duplicate BG game start ignored for active game: " + _current.Id);
                        RefreshGameMetadata();
                        CaptureTurn();
                        return;
                    }

                    var hero = ResolvePlayerHero();
                    var id = Ulid.NewUlid();
                    _current = new GameRecord
                    {
                        Id = id,
                        StartedAt = DateTime.UtcNow,
                        HeroId = hero.CardId,
                        HeroName = hero.Name,
                        HdtVersion = typeof(HdtCore).Assembly.GetName().Version?.ToString() ?? ""
                    };
                    _current.RawJsonPath = System.IO.Path.Combine(Logging.DataDir, "games", id + ".json");
                    _store.UpsertGame(_current);
                    _lastTurn = 0;
                    _ending = false;
                    _shopWatcher.Reset();
                    _powerLogActionWatcher.ResetToLatestLogEnd();
                    _trinketKeys.Clear();
                    _eventKeys.Clear();
                    Logging.Info("BG game started: " + _current.Id);
                }
            }
            catch (Exception exception)
            {
                Logging.Error(exception, "OnGameStart failed");
            }
        }

        private async void OnGameEnd()
        {
            var finished = _current;
            if (finished == null) return;
            _ending = true;
            await Task.Delay(1500);
            FinalizeGame(finished);
        }

        private void FinalizeGame(GameRecord finished)
        {
            try
            {
                _current = finished;
                RefreshGameMetadata();
                CaptureTurn();
                TryCaptureTrinkets(Math.Max(1, _lastTurn));
                finished.EndedAt = DateTime.UtcNow;
                finished.DurationSeconds = (int)Math.Max(0, (finished.EndedAt.Value - finished.StartedAt).TotalSeconds);
                finished.Placement = TryReadPlacement();
                finished.MmrBefore = TryReadMmr(HdtCore.Game.CurrentGameStats, "BattlegroundsRating");
                finished.MmrAfter = TryReadMmr(HdtCore.Game.CurrentGameStats, "BattlegroundsRatingAfter");
                finished.RawJsonPath = _store.WriteJsonDump(finished);
                _store.UpsertGame(finished);
                Logging.Info("BG game ended: " + finished.Id);
                if (ReferenceEquals(_current, finished))
                {
                    _current = null;
                }
                _ending = false;
            }
            catch (Exception exception)
            {
                Logging.Error(exception, "OnGameEnd failed");
                _ending = false;
            }
        }

        private void OnTurnStart(ActivePlayer player)
        {
            if (player != ActivePlayer.Player) return;
            CaptureTurn();
        }

        private void Poll()
        {
            lock (_sync)
            {
                if (_polling || _current == null || _ending || !IsBattlegrounds()) return;
                _polling = true;
                try
                {
                    CaptureTurn();
                    TryCaptureTrinkets(Math.Max(1, _lastTurn));
                    CapturePowerLogActions();
                    foreach (var evt in _shopWatcher.Diff(HdtCore.Game, _lastTurn))
                    {
                        if (evt.Purchase != null)
                        {
                            CapturePurchase(evt.Purchase);
                        }
                        if (evt.Upgrade != null)
                        {
                            CaptureUpgrade(evt.Upgrade);
                        }
                    }
                }
                finally
                {
                    _polling = false;
                }
            }
        }

        private void CapturePowerLogActions()
        {
            if (_current == null || !IsBattlegrounds()) return;
            var playerId = TryReadInt(HdtCore.Game.Player, "Id") ?? -1;
            var turn = Math.Max(1, _lastTurn > 0 ? _lastTurn : HdtCore.Game.GetTurnNumber());
            foreach (var action in _powerLogActionWatcher.Drain(turn, playerId))
            {
                if (!CaptureTrackerEvent(action.Event))
                {
                    continue;
                }
                if (action.Purchase != null)
                {
                    CapturePurchase(action.Purchase);
                }
                if (action.Upgrade != null)
                {
                    CaptureUpgrade(action.Upgrade);
                }
            }
        }

        private void CaptureCardEvent(string eventType, HdtCard card)
        {
            try
            {
                lock (_sync)
                {
                    if (_current == null || _ending || !IsBattlegrounds()) return;
                    var cardId = card.Id ?? "";
                    if (string.IsNullOrWhiteSpace(cardId)) return;
                    var cardName = !string.IsNullOrWhiteSpace(card.LocalizedName)
                        ? card.LocalizedName!
                        : !string.IsNullOrWhiteSpace(card.Name)
                            ? card.Name!
                            : cardId;
                    CaptureTrackerEvent(new TrackerActionEvent
                    {
                        TurnNumber = Math.Max(1, _lastTurn > 0 ? _lastTurn : HdtCore.Game.GetTurnNumber()),
                        EventType = eventType,
                        CardId = cardId,
                        CardName = cardName,
                        Source = "hdt-game-events",
                        RawJson = JsonConvert.SerializeObject(new
                        {
                            id = cardId,
                            name = card.Name,
                            localized_name = card.LocalizedName,
                            tech_level = card.TechLevel,
                            type = card.Type,
                            is_bacon_minion = card.IsBaconMinion
                        })
                    });
                }
            }
            catch (Exception exception)
            {
                Logging.Error(exception, "CaptureCardEvent failed");
            }
        }

        private bool CaptureTrackerEvent(TrackerActionEvent trackerEvent)
        {
            if (_current == null) return false;
            if (trackerEvent.TurnNumber <= 0)
            {
                trackerEvent.TurnNumber = Math.Max(1, _lastTurn);
            }
            if (trackerEvent.CreatedAt == default)
            {
                trackerEvent.CreatedAt = DateTime.UtcNow;
            }
            if (!_eventKeys.Add(trackerEvent.DedupKey))
            {
                return false;
            }
            _current.TrackerEvents.Add(trackerEvent);
            _store.WriteTrackerEvent(_current.Id, trackerEvent);
            Logging.Info($"Captured tracker event {trackerEvent.EventType}: {trackerEvent.CardName} ({trackerEvent.CardId}) on turn {trackerEvent.TurnNumber}");
            return true;
        }

        private void CapturePurchase(PurchaseEvent purchase)
        {
            if (_current == null) return;
            var key = $"purchase:{purchase.TurnNumber}:{purchase.CardId}:{purchase.CardName}:{purchase.Source}";
            if (!_eventKeys.Add(key))
            {
                return;
            }
            _current.Purchases.Add(purchase);
            _store.WritePurchase(_current.Id, purchase);
            Logging.Info($"Captured purchase {purchase.CardName} ({purchase.CardId}) on turn {purchase.TurnNumber} from {purchase.Source}");
        }

        private void CaptureUpgrade(UpgradeEvent upgrade)
        {
            if (_current == null) return;
            var key = $"upgrade:{upgrade.TurnNumber}:{upgrade.FromTier}:{upgrade.ToTier}:{upgrade.GoldPaid}";
            if (!_eventKeys.Add(key))
            {
                return;
            }
            _current.Upgrades.Add(upgrade);
            _store.WriteUpgrade(_current.Id, upgrade);
        }

        private void CaptureTurn()
        {
            try
            {
                if (_current == null || !IsBattlegrounds()) return;
                RefreshGameMetadata();
                var turn = Math.Max(1, HdtCore.Game.GetTurnNumber());
                if (_lastTurn > 0 && turn < _lastTurn)
                {
                    Logging.Info($"Ignored regressing turn snapshot {turn} after {_lastTurn} for game {_current.Id}");
                    return;
                }
                if (turn == _lastTurn) return;
                _lastTurn = turn;
                var snapshot = _shopWatcher.CreateTurnSnapshot(HdtCore.Game, turn);
                _current.Turns.Add(snapshot);
                _store.WriteTurn(_current.Id, snapshot);
                TryCaptureTrinkets(turn);
                Logging.Info($"Captured turn {turn} for game {_current.Id}");
            }
            catch (Exception exception)
            {
                Logging.Error(exception, "CaptureTurn failed");
            }
        }

        private void TryCaptureTrinkets(int turnNumber)
        {
            try
            {
                if (_current == null || turnNumber <= 0 || !IsBattlegrounds()) return;

                var game = HdtCore.Game;
                var playerId = TryReadInt(game.Player, "Id") ?? -1;
                var candidates = ReadEntities(game)
                    .Select(ToTrinketCandidate)
                    .Where(x => x != null)
                    .Cast<TrinketCandidate>()
                    .GroupBy(x => string.IsNullOrWhiteSpace(x.CardId) ? x.Name : x.CardId)
                    .Select(x => x.First())
                    .ToList();

                if (candidates.Count == 0) return;

                var offeredJson = JsonConvert.SerializeObject(candidates.Select(x => new
                {
                    card_id = x.CardId,
                    name = x.Name,
                    controller = x.Controller,
                    zone = x.Zone.ToString()
                }));

                var selected = candidates
                    .Where(x => !string.IsNullOrWhiteSpace(x.CardId) && !IsPlaceholderTrinket(x.CardId, x.Name) && x.Controller == playerId && IsLikelySelectedTrinketZone(x.Zone))
                    .ToList();

                foreach (var item in selected)
                {
                    var slot = InferTrinketSlot(turnNumber);
                    if (_current.Trinkets.Any(x => x.Slot == slot)) continue;
                    if (_current.Trinkets.Any(x => x.SelectedCardId == item.CardId)) continue;
                    var key = $"{slot}:{item.CardId}";
                    if (!_trinketKeys.Add(key)) continue;

                    var choice = new TrinketChoice
                    {
                        TurnNumber = turnNumber,
                        Slot = slot,
                        SelectedCardId = item.CardId,
                        SelectedName = item.Name,
                        OfferedJson = offeredJson,
                        Source = "entity-scan"
                    };
                    _current.Trinkets.Add(choice);
                    _store.WriteTrinket(_current.Id, choice);
                    Logging.Info($"Captured {slot} trinket {item.Name} for game {_current.Id}");
                }
            }
            catch (Exception exception)
            {
                Logging.Error(exception, "TryCaptureTrinkets failed");
            }
        }

        private static bool IsBattlegrounds()
        {
            try
            {
                return HdtCore.Game != null && HdtCore.Game.IsBattlegroundsMatch;
            }
            catch
            {
                return false;
            }
        }

        private static int? TryReadPlacement()
        {
            var game = HdtCore.Game;
            var details = game.CurrentGameStats?.BattlegroundsDetails;
            var placement = TryReadInt(details, "FinalPlacement");
            if (IsPlacement(placement)) return placement;

            var playerId = TryReadInt(game.Player, "Id") ?? -1;
            var entity = ReadEntities(game)
                .FirstOrDefault(x => HasTag(x, GameTag.PLAYER_LEADERBOARD_PLACE) && IsControlledBy(x, playerId));
            placement = entity != null ? SafeTag(entity, GameTag.PLAYER_LEADERBOARD_PLACE, 0) : 0;
            if (IsPlacement(placement)) return placement;

            var prop = game.GetType().GetProperty("BattlegroundsCurrentGameStanding", BindingFlags.Public | BindingFlags.Instance);
            var value = prop?.GetValue(game);
            placement = value is int current ? current : 0;
            return IsPlacement(placement) ? placement : (int?)null;
        }

        private void RefreshGameMetadata()
        {
            if (_current == null) return;
            var hero = ResolvePlayerHero();
            var changed = false;
            if (!IsUnknownHero(hero.CardId) && (IsUnknownHero(_current.HeroId) || string.IsNullOrWhiteSpace(_current.HeroId)))
            {
                _current.HeroId = hero.CardId;
                changed = true;
            }
            if (!IsUnknownHero(hero.Name) && (IsUnknownHero(_current.HeroName) || string.IsNullOrWhiteSpace(_current.HeroName)))
            {
                _current.HeroName = hero.Name;
                changed = true;
            }
            if (changed)
            {
                _store.UpsertGame(_current);
                Logging.Info($"Resolved player hero for game {_current.Id}: {_current.HeroName} ({_current.HeroId}) from {hero.Source}");
            }
        }

        private static string? GetString(object? instance, string property)
        {
            return instance?.GetType().GetProperty(property)?.GetValue(instance)?.ToString();
        }

        private static HeroCandidate ResolvePlayerHero()
        {
            var candidates = CollectHeroCandidates()
                .Where(x => !IsUnknownHero(x.CardId) || !IsUnknownHero(x.Name))
                .GroupBy(x => !IsUnknownHero(x.CardId) ? x.CardId : $"name:{x.Name}", StringComparer.OrdinalIgnoreCase)
                .Select(x => x.OrderByDescending(candidate => candidate.Score).First())
                .OrderByDescending(x => x.Score)
                .ToList();

            var best = candidates.FirstOrDefault();
            if (best == null)
            {
                return HeroCandidate.Unknown;
            }

            best.Name = ResolveHeroName(best.CardId, best.Name);
            return best;
        }

        private static List<HeroCandidate> CollectHeroCandidates()
        {
            var game = HdtCore.Game;
            var candidates = new List<HeroCandidate>();
            var playerId = TryReadInt(game.Player, "Id") ?? -1;

            AddHeroCandidate(candidates, HdtCore.Game.CurrentGameStats?.PlayerHeroCardId, null, "CurrentGameStats.PlayerHeroCardId", 130);
            AddHeroCandidateFromObject(candidates, TryReadFriendlyHeroEntity(), "friendly hero entity", 120);
            AddHeroCandidateFromObject(candidates, HdtCore.Game.Player?.Hero, "Game.Player.Hero", 110);

            AddHeroCandidatesFromProperties(candidates, HdtCore.Game.CurrentGameStats, "CurrentGameStats", 100);
            AddHeroCandidatesFromProperties(candidates, GetPropertyValue(HdtCore.Game.CurrentGameStats, "BattlegroundsDetails"), "BattlegroundsDetails", 95);
            AddHeroCandidatesFromProperties(candidates, HdtCore.Game.Player, "Game.Player", 90);

            foreach (var entity in ReadEntities(game).Where(x => IsHeroEntity(x) && !IsUnknownHero(GetString(x, "CardId"))))
            {
                var controller = SafeController(entity);
                var controlledByPlayer = playerId > 0 && (controller == playerId || IsControlledBy(entity, playerId));
                var hasLeaderboardPlace = HasTag(entity, GameTag.PLAYER_LEADERBOARD_PLACE);
                if (controlledByPlayer)
                {
                    AddHeroCandidateFromObject(candidates, entity, hasLeaderboardPlace ? "controlled leaderboard hero entity" : "controlled hero entity", hasLeaderboardPlace ? 118 : 108);
                }
            }

            return candidates;
        }

        private static void AddHeroCandidatesFromProperties(List<HeroCandidate> candidates, object? source, string sourceName, int score)
        {
            if (source == null) return;
            foreach (var property in source.GetType().GetProperties(BindingFlags.Public | BindingFlags.Instance))
            {
                if (property.GetIndexParameters().Length > 0 || !LooksLikeFriendlyHeroProperty(property.Name)) continue;
                object? value;
                try
                {
                    value = property.GetValue(source);
                }
                catch
                {
                    continue;
                }
                if (value == null) continue;

                if (value is string text)
                {
                    var lowerName = property.Name.ToLowerInvariant();
                    if (lowerName.Contains("cardid") || lowerName.EndsWith("id"))
                    {
                        AddHeroCandidate(candidates, text, null, $"{sourceName}.{property.Name}", score);
                    }
                    else
                    {
                        AddHeroCandidate(candidates, null, text, $"{sourceName}.{property.Name}", score - 15);
                    }
                    continue;
                }

                AddHeroCandidateFromObject(candidates, value, $"{sourceName}.{property.Name}", score - 5);
            }
        }

        private static bool LooksLikeFriendlyHeroProperty(string propertyName)
        {
            var name = propertyName.ToLowerInvariant();
            if (!name.Contains("hero")) return false;
            return !name.Contains("opponent")
                && !name.Contains("enemy")
                && !name.Contains("next")
                && !name.Contains("bob");
        }

        private static void AddHeroCandidateFromObject(List<HeroCandidate> candidates, object? source, string sourceName, int score)
        {
            if (source == null) return;
            var cardId = FirstKnownHeroId(GetString(source, "CardId"), GetString(source, "CardID"));
            var name = FirstKnownHeroName(GetString(source, "LocalizedName"), GetString(source, "Name"));
            AddHeroCandidate(candidates, cardId, name, sourceName, score);
        }

        private static void AddHeroCandidate(List<HeroCandidate> candidates, string? cardId, string? name, string source, int score)
        {
            var knownCardId = IsLikelyHeroCardId(cardId) ? cardId!.Trim() : "unknown";
            var knownName = FirstKnownHeroName(ResolveCardName(knownCardId, null), name);
            if (IsUnknownHero(knownCardId) && IsUnknownHero(knownName)) return;
            candidates.Add(new HeroCandidate
            {
                CardId = knownCardId,
                Name = knownName ?? "Unknown Hero",
                Source = source,
                Score = IsUnknownHero(knownCardId) ? score - 25 : score
            });
        }

        private static object? TryReadFriendlyHeroEntity()
        {
            var game = HdtCore.Game;
            var playerId = TryReadInt(game.Player, "Id") ?? -1;
            var entities = ReadEntities(game);
            return entities
                .FirstOrDefault(x => IsFriendlyHeroEntity(x, playerId) && HasTag(x, GameTag.PLAYER_LEADERBOARD_PLACE))
                ?? entities.FirstOrDefault(x => IsFriendlyHeroEntity(x, playerId));
        }

        private static bool IsFriendlyHeroEntity(object entity, int playerId)
        {
            if (playerId <= 0) return false;
            var cardId = GetString(entity, "CardId");
            if (IsUnknownHero(cardId)) return false;
            if (!IsHeroEntity(entity)) return false;
            var controller = SafeController(entity);
            return controller == playerId || IsControlledBy(entity, playerId);
        }

        private static string? FirstKnownHeroId(params string?[] candidates)
        {
            return candidates.FirstOrDefault(IsLikelyHeroCardId);
        }

        private static string? FirstKnownHeroName(params string?[] candidates)
        {
            return candidates.FirstOrDefault(x => !IsUnknownHero(x));
        }

        private static bool IsHeroEntity(object entity)
        {
            return SafeIs(entity, "IsHero") || SafeTag(entity, GameTag.CARDTYPE, 0) == (int)CardType.HERO;
        }

        private static bool IsLikelyHeroCardId(string? value)
        {
            if (IsUnknownHero(value)) return false;
            var id = value!.Trim();
            return id.IndexOf("HERO", StringComparison.OrdinalIgnoreCase) >= 0;
        }

        private static object[] ReadEntities(object game)
        {
            for (var attempt = 0; attempt < 3; attempt++)
            {
                try
                {
                    var raw = game.GetType().GetProperty("Entities")?.GetValue(game);
                    if (raw is System.Collections.IDictionary dictionary)
                    {
                        return dictionary.Values.Cast<object>().ToArray();
                    }
                    if (raw is System.Collections.IEnumerable enumerable)
                    {
                        return enumerable.Cast<object>().ToArray();
                    }
                    return Array.Empty<object>();
                }
                catch (InvalidOperationException)
                {
                    System.Threading.Thread.Sleep(10);
                }
            }
            return Array.Empty<object>();
        }

        private static string? ResolveCardName(string? cardId, string? fallback)
        {
            if (!string.IsNullOrWhiteSpace(cardId))
            {
                var card = Hearthstone_Deck_Tracker.Hearthstone.Database.GetCardFromId(cardId);
                if (!string.IsNullOrWhiteSpace(card?.LocalizedName)) return card!.LocalizedName;
                if (!string.IsNullOrWhiteSpace(card?.Name)) return card!.Name;
            }
            return fallback;
        }

        private static string ResolveHeroName(string? cardId, string? fallback)
        {
            if (!IsUnknownHero(cardId))
            {
                var name = ResolveCardName(cardId, null);
                if (!IsUnknownHero(name)) return name!;
            }
            if (!IsUnknownHero(fallback)) return fallback!;
            return "Unknown Hero";
        }

        private static bool IsUnknownHero(string? value)
        {
            if (string.IsNullOrWhiteSpace(value)) return true;
            var name = value ?? "";
            return name == "unknown"
                || name == "Unknown Hero"
                || name.Contains("HERO_PH")
                || name.Contains("BaconPHhero")
                || name.Contains("KelThuzad")
                || name.Contains("Kel'Thuzad");
        }

        private static bool IsPlacement(int? placement)
        {
            return placement >= 1 && placement <= 8;
        }

        private static TrinketCandidate? ToTrinketCandidate(object entity)
        {
            var cardId = GetString(entity, "CardId") ?? "";
            var name = ResolveCardName(cardId, GetString(entity, "LocalizedName") ?? GetString(entity, "Name")) ?? cardId;
            if (!IsLikelyTrinket(cardId, name)) return null;
            return new TrinketCandidate
            {
                CardId = cardId,
                Name = string.IsNullOrWhiteSpace(name) ? cardId : name,
                Controller = SafeController(entity),
                Zone = SafeZone(entity)
            };
        }

        private static bool IsLikelyTrinket(string? cardId, string? name)
        {
            var haystack = ((cardId ?? "") + " " + (name ?? "")).ToLowerInvariant();
            return haystack.Contains("magicitem") || haystack.Contains("trinket");
        }

        private static bool IsPlaceholderTrinket(string? cardId, string? name)
        {
            var normalizedName = (name ?? "").Trim().ToLowerInvariant();
            return cardId == "BG30_Trinket_1st"
                || cardId == "BG30_Trinket_2nd"
                || normalizedName == "lesser trinket"
                || normalizedName == "greater trinket";
        }

        private static bool IsLikelySelectedTrinketZone(Zone zone)
        {
            return zone == Zone.PLAY || zone == Zone.SECRET;
        }

        private static string InferTrinketSlot(int turnNumber)
        {
            return turnNumber < 9 ? "lesser" : "greater";
        }

        private static int? TryReadInt(object? instance, string property)
        {
            try
            {
                var value = instance?.GetType().GetProperty(property)?.GetValue(instance);
                return value is int number ? number : (int?)null;
            }
            catch
            {
                return null;
            }
        }

        private static int? TryReadMmr(object? instance, string property)
        {
            var value = TryReadInt(instance, property);
            return value > 0 ? value : null;
        }

        private static object? GetPropertyValue(object? instance, string property)
        {
            try
            {
                return instance?.GetType().GetProperty(property)?.GetValue(instance);
            }
            catch
            {
                return null;
            }
        }

        private static bool SafeIs(object entity, string property)
        {
            try
            {
                var value = entity.GetType().GetProperty(property)?.GetValue(entity);
                return value is bool flag && flag;
            }
            catch
            {
                return false;
            }
        }

        private static bool HasTag(dynamic entity, GameTag tag)
        {
            try { return entity.HasTag(tag); } catch { return SafeTag(entity, tag, 0) > 0; }
        }

        private static int SafeTag(dynamic entity, GameTag tag, int fallback)
        {
            try { return (int)entity.GetTag(tag); } catch { return fallback; }
        }

        private static int SafeController(dynamic entity)
        {
            var lettuceController = SafeTag(entity, GameTag.LETTUCE_CONTROLLER, 0);
            if (lettuceController > 0)
            {
                return lettuceController;
            }
            return SafeTag(entity, GameTag.CONTROLLER, 0);
        }

        private static Zone SafeZone(dynamic entity)
        {
            var fakeZone = SafeTag(entity, GameTag.FAKE_ZONE, 0);
            if (fakeZone > 0)
            {
                return (Zone)fakeZone;
            }
            var zone = SafeTag(entity, GameTag.ZONE, 0);
            return zone > 0 ? (Zone)zone : Zone.INVALID;
        }

        private static bool IsControlledBy(dynamic entity, int playerId)
        {
            try { return playerId > 0 && entity.IsControlledBy(playerId); } catch { return false; }
        }

        private sealed class TrinketCandidate
        {
            public string CardId { get; set; } = "";
            public string Name { get; set; } = "";
            public int Controller { get; set; }
            public Zone Zone { get; set; }
        }

        private sealed class HeroCandidate
        {
            public static readonly HeroCandidate Unknown = new HeroCandidate
            {
                CardId = "unknown",
                Name = "Unknown Hero",
                Source = "none",
                Score = 0
            };

            public string CardId { get; set; } = "";
            public string Name { get; set; } = "";
            public string Source { get; set; } = "";
            public int Score { get; set; }
        }
    }
}
