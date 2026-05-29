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

export type GameListItem = {
  id: string;
  started_at: string;
  ended_at: string | null;
  hero_id: string;
  hero_name: string;
  placement: number | null;
  mmr_before: number | null;
  mmr_after: number | null;
  duration_seconds: number | null;
};

export type Summary = {
  totalGames: number;
  avgPlacement: number | null;
  top4Rate: number;
  top1Rate: number;
  latestMmr: number | null;
  recentGames: GameListItem[];
  heroStats: {
    heroId: string;
    heroName: string;
    games: number;
    avgPlacement: number;
    top4Rate: number;
    top1Rate: number;
  }[];
  mmrTimeline: {
    id: string;
    started_at: string;
    mmr_after: number;
  }[];
};

export type GameDetailResponse = {
  game: GameListItem & {
    hdt_version: string | null;
    plugin_version: string | null;
    raw_json_path: string | null;
  };
  turns: {
    id: number;
    game_id: string;
    turn_number: number;
    tavern_tier: number;
    gold: number;
    health: number;
    triple_progress: number | null;
    hand_size: number | null;
    board: BoardMinion[];
    shop: BoardMinion[];
  }[];
  purchases: {
    id: number;
    game_id: string;
    turn_number: number;
    card_id: string;
    card_name: string;
    tier: number;
    gold_paid: number;
    source: string;
  }[];
  upgrades: {
    id: number;
    game_id: string;
    turn_number: number;
    from_tier: number;
    to_tier: number;
    gold_paid: number;
  }[];
  combats: {
    id: number;
    game_id: string;
    turn_number: number;
    opponent_hero_id: string | null;
    opponentBoard: BoardMinion[];
    result: 'win' | 'loss' | 'tie';
    damage_dealt: number | null;
    damage_taken: number | null;
  }[];
  trinkets: {
    id: number;
    game_id: string;
    turn_number: number;
    slot: 'lesser' | 'greater' | 'unknown';
    selected_card_id: string | null;
    selected_name: string | null;
    offered_json: string | null;
    source: string;
    offered: {
      cardId: string;
      name: string;
      controller: number | null;
      zone: string | null;
    }[];
  }[];
  trackerEvents: {
    id: number;
    game_id: string;
    turn_number: number;
    event_type: string;
    card_id: string | null;
    card_name: string | null;
    entity_id: number | null;
    target_card_id: string | null;
    target_name: string | null;
    target_entity_id: number | null;
    source: string;
    raw_json: string | null;
    created_at: string;
  }[];
};

export type CurveStats = {
  archetype: string;
  games: number;
  avgPlacement: number;
  top4Rate: number;
  top1Rate: number;
  sampleGameIds: string[];
  avgTurnToTier: {
    t2: number | null;
    t3: number | null;
    t4: number | null;
    t5: number | null;
    t6: number | null;
  };
  medianCurve: {
    turn: number;
    tier: number;
  }[];
  commonMinions: {
    cardId: string;
    cardName: string;
    phase: 'early' | 'mid' | 'late';
    count: number;
  }[];
};

export type BucketStats = {
  games: number;
  top4Rate: number;
  avgPlacement: number;
};

export type TierTransition = {
  tier: number;
  benchmarkTurn: number;
  benchmarkLabel: string;
  tempoCritical: boolean;
  games: number;
  avgTurn: number | null;
  medianTurn: number | null;
  avgHealthAtLevel: number | null;
  distribution: { turn: number; count: number }[];
  onPace: BucketStats;
  behind: BucketStats;
};

export type LevelingCurvesResponse = {
  baseline: {
    overallAvgPlacement: number;
    totalGames: number;
    standardCurveRate: number;
  };
  transitions: TierTransition[];
  archetypes: CurveStats[];
};

export type MinionStat = {
  cardId: string;
  cardName: string;
  tier: number;
  phase: 'early' | 'mid' | 'late';
  games: number;
  avgPlacement: number;
  top4Rate: number;
  top1Rate: number;
  deltaVsBaseline: number;
};
