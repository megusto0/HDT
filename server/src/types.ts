export type BoardMinion = {
  cardId: string;
  name: string;
  tier: number;
  attack: number;
  health: number;
  tribe?: string;
  taunt?: boolean;
  divineShield?: boolean;
};

export type GameRow = {
  id: string;
  started_at: string;
  ended_at: string | null;
  hero_id: string;
  hero_name: string;
  placement: number | null;
  mmr_before: number | null;
  mmr_after: number | null;
  duration_seconds: number | null;
  hdt_version: string | null;
  plugin_version: string | null;
  raw_json_path: string | null;
};

export type TurnRow = {
  id: number;
  game_id: string;
  turn_number: number;
  tavern_tier: number;
  gold: number;
  health: number;
  triple_progress: number | null;
  hand_size: number | null;
  board_minions_json: string | null;
  shop_minions_json: string | null;
};

export type PurchaseRow = {
  id: number;
  game_id: string;
  turn_number: number;
  card_id: string;
  card_name: string;
  tier: number;
  gold_paid: number;
  source: string;
};

