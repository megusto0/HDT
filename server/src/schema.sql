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
