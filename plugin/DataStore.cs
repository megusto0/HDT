using System;
using System.IO;
using HDTBgTracker.Models;
using Microsoft.Data.Sqlite;
using Newtonsoft.Json;
using Newtonsoft.Json.Serialization;

namespace HDTBgTracker
{
    public sealed class DataStore
    {
        private readonly string _dbPath;
        private readonly string _gamesDir;

        public DataStore()
        {
            _dbPath = Path.Combine(Logging.DataDir, "stats.db");
            _gamesDir = Path.Combine(Logging.DataDir, "games");
        }

        public void EnsureCreated()
        {
            Directory.CreateDirectory(Logging.DataDir);
            Directory.CreateDirectory(_gamesDir);
            using (var connection = Open())
            {
                connection.Open();
                Execute(connection, "PRAGMA journal_mode=WAL;");
                Execute(connection, Schema);
            }
        }

        public void UpsertGame(GameRecord game)
        {
            using (var connection = Open())
            {
                connection.Open();
                using (var command = connection.CreateCommand())
                {
                    command.CommandText = @"INSERT INTO games
                        (id, started_at, ended_at, hero_id, hero_name, placement, mmr_before, mmr_after, duration_seconds, hdt_version, plugin_version, raw_json_path)
                        VALUES ($id, $started_at, $ended_at, $hero_id, $hero_name, $placement, $mmr_before, $mmr_after, $duration_seconds, $hdt_version, $plugin_version, $raw_json_path)
                        ON CONFLICT(id) DO UPDATE SET
                            started_at = excluded.started_at,
                            ended_at = excluded.ended_at,
                            hero_id = excluded.hero_id,
                            hero_name = excluded.hero_name,
                            placement = excluded.placement,
                            mmr_before = excluded.mmr_before,
                            mmr_after = excluded.mmr_after,
                            duration_seconds = excluded.duration_seconds,
                            hdt_version = excluded.hdt_version,
                            plugin_version = excluded.plugin_version,
                            raw_json_path = excluded.raw_json_path";
                    Add(command, "$id", game.Id);
                    Add(command, "$started_at", game.StartedAt.ToUniversalTime().ToString("O"));
                    Add(command, "$ended_at", game.EndedAt?.ToUniversalTime().ToString("O"));
                    Add(command, "$hero_id", game.HeroId);
                    Add(command, "$hero_name", game.HeroName);
                    Add(command, "$placement", game.Placement);
                    Add(command, "$mmr_before", game.MmrBefore);
                    Add(command, "$mmr_after", game.MmrAfter);
                    Add(command, "$duration_seconds", game.DurationSeconds);
                    Add(command, "$hdt_version", game.HdtVersion);
                    Add(command, "$plugin_version", game.PluginVersion);
                    Add(command, "$raw_json_path", game.RawJsonPath);
                    command.ExecuteNonQuery();
                }
            }
        }

        public void WriteTurn(string gameId, TurnSnapshot turn)
        {
            using (var connection = Open())
            {
                connection.Open();
                using (var command = connection.CreateCommand())
                {
                    command.CommandText = @"INSERT OR REPLACE INTO turns
                        (game_id, turn_number, tavern_tier, gold, health, triple_progress, hand_size, board_minions_json, shop_minions_json)
                        VALUES ($game_id, $turn_number, $tavern_tier, $gold, $health, $triple_progress, $hand_size, $board, $shop)";
                    Add(command, "$game_id", gameId);
                    Add(command, "$turn_number", turn.TurnNumber);
                    Add(command, "$tavern_tier", turn.TavernTier);
                    Add(command, "$gold", turn.Gold);
                    Add(command, "$health", turn.Health);
                    Add(command, "$triple_progress", turn.TripleProgress);
                    Add(command, "$hand_size", turn.HandSize);
                    Add(command, "$board", JsonConvert.SerializeObject(turn.BoardMinions, JsonSettings));
                    Add(command, "$shop", JsonConvert.SerializeObject(turn.ShopMinions, JsonSettings));
                    command.ExecuteNonQuery();
                }
            }
        }

        public void WritePurchase(string gameId, PurchaseEvent purchase)
        {
            ExecuteEvent(@"INSERT INTO purchases (game_id, turn_number, card_id, card_name, tier, gold_paid, source)
                VALUES ($game_id, $turn_number, $card_id, $card_name, $tier, $gold_paid, $source)", command =>
            {
                Add(command, "$game_id", gameId);
                Add(command, "$turn_number", purchase.TurnNumber);
                Add(command, "$card_id", purchase.CardId);
                Add(command, "$card_name", purchase.CardName);
                Add(command, "$tier", purchase.Tier);
                Add(command, "$gold_paid", purchase.GoldPaid);
                Add(command, "$source", purchase.Source);
            });
        }

        public void WriteUpgrade(string gameId, UpgradeEvent upgrade)
        {
            ExecuteEvent(@"INSERT INTO upgrades (game_id, turn_number, from_tier, to_tier, gold_paid)
                VALUES ($game_id, $turn_number, $from_tier, $to_tier, $gold_paid)", command =>
            {
                Add(command, "$game_id", gameId);
                Add(command, "$turn_number", upgrade.TurnNumber);
                Add(command, "$from_tier", upgrade.FromTier);
                Add(command, "$to_tier", upgrade.ToTier);
                Add(command, "$gold_paid", upgrade.GoldPaid);
            });
        }

        public void WriteCombat(string gameId, CombatResult combat)
        {
            ExecuteEvent(@"INSERT INTO combats (game_id, turn_number, opponent_hero_id, opponent_board_json, result, damage_dealt, damage_taken)
                VALUES ($game_id, $turn_number, $opponent_hero_id, $opponent_board_json, $result, $damage_dealt, $damage_taken)", command =>
            {
                Add(command, "$game_id", gameId);
                Add(command, "$turn_number", combat.TurnNumber);
                Add(command, "$opponent_hero_id", combat.OpponentHeroId);
                Add(command, "$opponent_board_json", JsonConvert.SerializeObject(combat.OpponentBoard));
                Add(command, "$result", combat.Result);
                Add(command, "$damage_dealt", combat.DamageDealt);
                Add(command, "$damage_taken", combat.DamageTaken);
            });
        }

        public void WriteTrinket(string gameId, TrinketChoice trinket)
        {
            ExecuteEvent(@"INSERT OR REPLACE INTO trinkets
                (game_id, turn_number, slot, selected_card_id, selected_name, offered_json, source)
                VALUES ($game_id, $turn_number, $slot, $selected_card_id, $selected_name, $offered_json, $source)", command =>
            {
                Add(command, "$game_id", gameId);
                Add(command, "$turn_number", trinket.TurnNumber);
                Add(command, "$slot", trinket.Slot);
                Add(command, "$selected_card_id", trinket.SelectedCardId);
                Add(command, "$selected_name", trinket.SelectedName);
                Add(command, "$offered_json", trinket.OfferedJson);
                Add(command, "$source", trinket.Source);
            });
        }

        public string WriteJsonDump(GameRecord game)
        {
            Directory.CreateDirectory(_gamesDir);
            var path = Path.Combine(_gamesDir, game.Id + ".json");
            game.RawJsonPath = path;
            var payload = new
            {
                id = game.Id,
                schema_version = game.SchemaVersion,
                game = new
                {
                    id = game.Id,
                    started_at = game.StartedAt.ToUniversalTime().ToString("O"),
                    ended_at = game.EndedAt?.ToUniversalTime().ToString("O"),
                    hero_id = game.HeroId,
                    hero_name = game.HeroName,
                    placement = game.Placement,
                    mmr_before = game.MmrBefore,
                    mmr_after = game.MmrAfter,
                    duration_seconds = game.DurationSeconds,
                    hdt_version = game.HdtVersion,
                    plugin_version = game.PluginVersion,
                    raw_json_path = path
                },
                turns = game.Turns,
                purchases = game.Purchases,
                upgrades = game.Upgrades,
                combats = game.Combats,
                trinkets = game.Trinkets
            };
            File.WriteAllText(path, JsonConvert.SerializeObject(payload, JsonSettings));
            return path;
        }

        private SqliteConnection Open()
        {
            return new SqliteConnection(new SqliteConnectionStringBuilder { DataSource = _dbPath }.ToString());
        }

        private void ExecuteEvent(string sql, Action<SqliteCommand> bind)
        {
            using (var connection = Open())
            {
                connection.Open();
                using (var command = connection.CreateCommand())
                {
                    command.CommandText = sql;
                    bind(command);
                    command.ExecuteNonQuery();
                }
            }
        }

        private static void Execute(SqliteConnection connection, string sql)
        {
            using (var command = connection.CreateCommand())
            {
                command.CommandText = sql;
                command.ExecuteNonQuery();
            }
        }

        private static void Add(SqliteCommand command, string name, object? value)
        {
            command.Parameters.AddWithValue(name, value ?? DBNull.Value);
        }

        private static readonly JsonSerializerSettings JsonSettings = new JsonSerializerSettings
        {
            Formatting = Formatting.Indented,
            ContractResolver = new DefaultContractResolver { NamingStrategy = new SnakeCaseNamingStrategy() }
        };

        private const string Schema = @"
CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  hero_id TEXT NOT NULL,
  hero_name TEXT NOT NULL,
  placement INTEGER,
  mmr_before INTEGER,
  mmr_after INTEGER,
  duration_seconds INTEGER,
  hdt_version TEXT,
  plugin_version TEXT,
  raw_json_path TEXT
);
CREATE TABLE IF NOT EXISTS turns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  turn_number INTEGER NOT NULL,
  tavern_tier INTEGER NOT NULL,
  gold INTEGER NOT NULL,
  health INTEGER NOT NULL,
  triple_progress INTEGER,
  hand_size INTEGER,
  board_minions_json TEXT,
  shop_minions_json TEXT,
  UNIQUE (game_id, turn_number)
);
CREATE TABLE IF NOT EXISTS purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  turn_number INTEGER NOT NULL,
  card_id TEXT NOT NULL,
  card_name TEXT NOT NULL,
  tier INTEGER NOT NULL,
  gold_paid INTEGER NOT NULL,
  source TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS upgrades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  turn_number INTEGER NOT NULL,
  from_tier INTEGER NOT NULL,
  to_tier INTEGER NOT NULL,
  gold_paid INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS combats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  turn_number INTEGER NOT NULL,
  opponent_hero_id TEXT,
  opponent_board_json TEXT,
  result TEXT NOT NULL,
  damage_dealt INTEGER,
  damage_taken INTEGER
);
CREATE TABLE IF NOT EXISTS trinkets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  turn_number INTEGER NOT NULL,
  slot TEXT NOT NULL,
  selected_card_id TEXT,
  selected_name TEXT,
  offered_json TEXT,
  source TEXT NOT NULL,
  UNIQUE (game_id, slot, selected_card_id)
);
CREATE INDEX IF NOT EXISTS idx_games_hero ON games(hero_id);
CREATE INDEX IF NOT EXISTS idx_games_started ON games(started_at);
CREATE INDEX IF NOT EXISTS idx_purchases_card ON purchases(card_id);
CREATE INDEX IF NOT EXISTS idx_purchases_turn ON purchases(turn_number);
CREATE INDEX IF NOT EXISTS idx_trinkets_game ON trinkets(game_id);
";
    }
}
