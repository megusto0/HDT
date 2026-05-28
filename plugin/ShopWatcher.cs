using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using HDTBgTracker.Models;
using HearthDb.Enums;
using HdtCore = Hearthstone_Deck_Tracker.Core;

namespace HDTBgTracker
{
    public sealed class ShopEvent
    {
        public PurchaseEvent? Purchase { get; set; }
        public UpgradeEvent? Upgrade { get; set; }
    }

    public sealed class ShopWatcher
    {
        private Snapshot? _previous;

        public void Reset()
        {
            _previous = null;
        }

        public IReadOnlyList<ShopEvent> Diff(dynamic game, int turnNumber)
        {
            var current = ReadSnapshot(game, turnNumber);
            var events = new List<ShopEvent>();
            if (_previous != null)
            {
                if (current.TavernTier > _previous.TavernTier)
                {
                    var upgradeTurn = current.TurnNumber > _previous.TurnNumber
                        ? Math.Max(2, current.TurnNumber - 1)
                        : current.TurnNumber;
                    events.Add(new ShopEvent
                    {
                        Upgrade = new UpgradeEvent
                        {
                            TurnNumber = upgradeTurn,
                            FromTier = _previous.TavernTier,
                            ToTier = current.TavernTier,
                            GoldPaid = Math.Max(0, _previous.Gold - current.Gold)
                        }
                    });
                }

                var previousShop = _previous.Shop.ToDictionary(x => x.CardId + ":" + x.Name);
                foreach (var minion in current.Hand.Concat(current.Board))
                {
                    if (previousShop.ContainsKey(minion.CardId + ":" + minion.Name))
                    {
                        events.Add(new ShopEvent
                        {
                            Purchase = new PurchaseEvent
                            {
                                TurnNumber = turnNumber,
                                CardId = minion.CardId,
                                CardName = minion.Name,
                                Tier = Math.Max(1, minion.Tier),
                                GoldPaid = 3,
                                Source = "shop"
                            }
                        });
                    }
                }
            }
            _previous = current;
            return events;
        }

        public TurnSnapshot CreateTurnSnapshot(dynamic game, int turnNumber)
        {
            var snapshot = ReadSnapshot(game, turnNumber);
            return new TurnSnapshot
            {
                TurnNumber = turnNumber,
                TavernTier = snapshot.TavernTier,
                Gold = snapshot.Gold,
                Health = snapshot.Health,
                TripleProgress = 0,
                HandSize = snapshot.Hand.Count,
                BoardMinions = snapshot.Board,
                ShopMinions = snapshot.Shop
            };
        }

        private static Snapshot ReadSnapshot(dynamic game, int turnNumber)
        {
            var entities = ReadEntities((object)game).ToList();
            var playerId = SafeInt(game.Player, "Id", -1);
            var playerEntities = entities.Where(e => SafeController(e) == playerId).ToList();
            var hero = game.Player.Hero;
            List<BoardMinion> board = ReadPlayerEntities((object)game, "Minions").Where(e => IsMinion(e)).Select(e => (BoardMinion)ToMinion(e)).ToList();
            if (board.Count == 0)
            {
                board = ReadPlayerEntities((object)game, "Board").Where(e => IsMinion(e)).Select(e => (BoardMinion)ToMinion(e)).ToList();
            }
            if (board.Count == 0 && playerId > 0)
            {
                board = playerEntities.Where(e => SafeIs(e, "IsInPlay") && IsMinion(e)).Select(e => (BoardMinion)ToMinion(e)).ToList();
            }

            List<BoardMinion> hand = ReadPlayerEntities((object)game, "Hand").Where(e => IsMinion(e)).Select(e => (BoardMinion)ToMinion(e)).ToList();
            if (hand.Count == 0 && playerId > 0)
            {
                hand = playerEntities.Where(e => SafeIs(e, "IsInHand") && IsMinion(e)).Select(e => (BoardMinion)ToMinion(e)).ToList();
            }

            var shop = ReadOverlayShop().ToList();
            if (shop.Count == 0)
            {
                shop = entities.Where(e => IsLikelyShopMinion(e)).Select(e => (BoardMinion)ToMinion(e)).Take(7).ToList();
            }

            return new Snapshot
            {
                TurnNumber = turnNumber,
                TavernTier = SafeTag(hero, GameTag.PLAYER_TECH_LEVEL, 1),
                Gold = SafeTag(hero, GameTag.RESOURCES, 0),
                Health = EffectiveHealth(hero),
                Board = board,
                Hand = hand,
                Shop = shop
            };
        }

        private static IEnumerable<dynamic> ReadEntities(object game)
        {
            for (var attempt = 0; attempt < 3; attempt++)
            {
                try
                {
                    var raw = game.GetType().GetProperty("Entities")?.GetValue(game);
                    if (raw == null)
                    {
                        return Enumerable.Empty<dynamic>();
                    }
                    var enumerable = raw is IDictionary dictionary ? dictionary.Values : (IEnumerable)raw;
                    return enumerable.Cast<dynamic>().ToArray();
                }
                catch (InvalidOperationException)
                {
                    Thread.Sleep(10);
                }
            }
            return Enumerable.Empty<dynamic>();
        }

        private static IEnumerable<dynamic> ReadPlayerEntities(object game, string property)
        {
            try
            {
                var player = game.GetType().GetProperty("Player")?.GetValue(game);
                if (player == null) return Enumerable.Empty<dynamic>();
                var raw = player.GetType().GetProperty(property)?.GetValue(player);
                return raw is IEnumerable enumerable ? enumerable.Cast<dynamic>() : Enumerable.Empty<dynamic>();
            }
            catch
            {
                return Enumerable.Empty<dynamic>();
            }
        }

        private static IEnumerable<BoardMinion> ReadOverlayShop()
        {
            object? overlay;
            try
            {
                overlay = HdtCore.Overlay;
            }
            catch
            {
                yield break;
            }

            var pinning = overlay?.GetType().GetProperty("BattlegroundsMinionPinningViewModel")?.GetValue(overlay);
            var shopCards = pinning?.GetType().GetProperty("ShopCards")?.GetValue(pinning) as IEnumerable;
            if (shopCards == null)
            {
                yield break;
            }

            foreach (var slot in shopCards)
            {
                if (!SafeBool(slot, "IsSlotOccupied"))
                {
                    continue;
                }
                var cardId = SafeString(slot, "CardId");
                if (string.IsNullOrWhiteSpace(cardId))
                {
                    continue;
                }
                yield return ToMinion(cardId);
            }
        }

        private static bool IsLikelyShopMinion(dynamic entity)
        {
            var zone = SafeZone(entity);
            return IsMinion(entity) && (zone == Zone.SETASIDE || SafeIs(entity, "IsInSetAside"));
        }

        private static bool IsMinion(dynamic entity)
        {
            return SafeIs(entity, "IsMinion") || SafeTag(entity, GameTag.CARDTYPE, 0) == (int)CardType.MINION;
        }

        private static BoardMinion ToMinion(dynamic entity)
        {
            var cardId = SafeString(entity, "CardId");
            var name = SafeString(entity, "LocalizedName", SafeString(entity, "Name", ""));
            var card = Hearthstone_Deck_Tracker.Hearthstone.Database.GetCardFromId(cardId);
            return new BoardMinion
            {
                CardId = cardId,
                Name = !string.IsNullOrWhiteSpace(name) ? name : card?.LocalizedName ?? card?.Name ?? "Unknown",
                Tier = SafeTag(entity, GameTag.TECH_LEVEL, card?.TechLevel ?? 0),
                Attack = SafeTag(entity, GameTag.ATK, 0),
                Health = Math.Max(0, SafeTag(entity, GameTag.HEALTH, 0) - SafeTag(entity, GameTag.DAMAGE, 0)),
                Taunt = SafeTag(entity, GameTag.TAUNT, 0) > 0,
                DivineShield = SafeTag(entity, GameTag.DIVINE_SHIELD, 0) > 0
            };
        }

        private static int EffectiveHealth(dynamic entity)
        {
            var health = SafeTag(entity, GameTag.HEALTH, 0);
            var damage = SafeTag(entity, GameTag.DAMAGE, 0);
            var armor = SafeTag(entity, GameTag.ARMOR, 0);
            return health + armor - damage;
        }

        private static BoardMinion ToMinion(string cardId)
        {
            var card = Hearthstone_Deck_Tracker.Hearthstone.Database.GetCardFromId(cardId);
            return new BoardMinion
            {
                CardId = cardId,
                Name = card?.LocalizedName ?? card?.Name ?? cardId,
                Tier = card?.TechLevel ?? 0,
                Attack = 0,
                Health = 0,
                Taunt = false,
                DivineShield = false
            };
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

        private static int SafeTag(dynamic entity, GameTag tag, int fallback)
        {
            try { return (int)entity.GetTag(tag); } catch { return fallback; }
        }

        private static bool SafeIs(dynamic entity, string property)
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

        private static int SafeInt(dynamic entity, string property, int fallback)
        {
            try
            {
                var value = entity.GetType().GetProperty(property)?.GetValue(entity);
                return value is int number ? number : fallback;
            }
            catch
            {
                return fallback;
            }
        }

        private static bool SafeBool(object entity, string property)
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

        private static string SafeString(dynamic entity, string property, string fallback = "")
        {
            try
            {
                var value = entity.GetType().GetProperty(property)?.GetValue(entity);
                return value?.ToString() ?? fallback;
            }
            catch
            {
                return fallback;
            }
        }

        private sealed class Snapshot
        {
            public int TurnNumber { get; set; }
            public int TavernTier { get; set; }
            public int Gold { get; set; }
            public int Health { get; set; }
            public List<BoardMinion> Board { get; set; } = new List<BoardMinion>();
            public List<BoardMinion> Hand { get; set; } = new List<BoardMinion>();
            public List<BoardMinion> Shop { get; set; } = new List<BoardMinion>();
        }
    }
}
