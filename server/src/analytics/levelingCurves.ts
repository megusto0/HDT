import type Database from 'better-sqlite3';
import { hasKnownGameHero } from '../heroes.js';

type TierTurns = {
  t2: number | null;
  t3: number | null;
  t4: number | null;
  t5: number | null;
  t6: number | null;
};

type CurveGame = {
  id: string;
  started_at: string;
  placement: number | null;
  turns: TierTurns;
};

export type CurveStats = {
  archetype: string;
  games: number;
  avgPlacement: number;
  top4Rate: number;
  top1Rate: number;
  sampleGameIds: string[];
  avgTurnToTier: TierTurns;
  medianCurve: { turn: number; tier: number }[];
  commonMinions: { cardId: string; cardName: string; phase: 'early' | 'mid' | 'late'; count: number }[];
};

type TurnRecord = {
  game_id: string;
  turn_number: number;
  tavern_tier: number;
};

type PurchaseRecord = {
  game_id: string;
  turn_number: number;
  card_id: string;
  card_name: string;
};

type BoardTurnRecord = {
  game_id: string;
  turn_number: number;
  board_minions_json: string | null;
};

type BoardMinionDump = {
  cardId?: string;
  card_id?: string;
  name?: string;
  Name?: string;
};

type GameRecord = {
  id: string;
  started_at: string;
  hero_id: string;
  hero_name: string;
  placement: number | null;
};

const archetypeOrder = [
  'hyper-fast',
  'tier-4-rush',
  'standard-fast',
  'tier-3-stall',
  'economy',
  'late-tier-6',
  'other'
];

function firstTierTurns(turns: TurnRecord[]): TierTurns {
  const result: TierTurns = { t2: null, t3: null, t4: null, t5: null, t6: null };
  const sorted = [...turns].sort((a, b) => a.turn_number - b.turn_number);
  let previous: TurnRecord | null = null;
  let highestTier = 1;
  for (const turn of sorted) {
    if (previous && turn.turn_number <= previous.turn_number) continue;
    if (turn.tavern_tier < highestTier) continue;
    const previousTier = previous?.tavern_tier ?? 1;
    const gap = previous ? turn.turn_number - previous.turn_number : turn.turn_number;
    if (gap <= 2) {
      for (const tier of [2, 3, 4, 5, 6] as const) {
        const key = `t${tier}` as keyof TierTurns;
        if (result[key] === null && previousTier < tier && turn.tavern_tier >= tier) {
          result[key] = turn.turn_number;
        }
      }
    }
    highestTier = Math.max(highestTier, turn.tavern_tier);
    previous = turn;
  }
  return result;
}

function hasReliableCurve(turns: TierTurns) {
  return turns.t2 !== null || turns.t3 !== null || turns.t4 !== null;
}

function cleanTurns(turns: TurnRecord[]) {
  const result: TurnRecord[] = [];
  let lastTurn = 0;
  let highestTier = 1;
  for (const turn of [...turns].sort((a, b) => a.turn_number - b.turn_number)) {
    if (turn.turn_number <= lastTurn) continue;
    if (turn.tavern_tier < highestTier) continue;
    result.push(turn);
    lastTurn = turn.turn_number;
    highestTier = Math.max(highestTier, turn.tavern_tier);
  }
  return result;
}

function actionTurns(turns: TurnRecord[]) {
  const cleaned = cleanTurns(turns);
  const result: TurnRecord[] = [];
  for (const turn of cleaned) {
    const previous = result.at(-1);
    if (!previous) {
      result.push({ ...turn });
      continue;
    }

    if (turn.tavern_tier > previous.tavern_tier) {
      const actionTurn = Math.max(2, turn.turn_number - 1);
      if (actionTurn <= previous.turn_number) {
        previous.tavern_tier = turn.tavern_tier;
      } else {
        result.push({ ...turn, turn_number: actionTurn });
      }
      continue;
    }

    if (turn.turn_number > previous.turn_number) {
      result.push({ ...turn });
    }
  }
  return result;
}

export function classifyCurve(t: TierTurns) {
  if (t.t2 !== null && t.t3 !== null && t.t4 !== null && t.t2 <= 2 && t.t3 <= 4 && t.t4 <= 6) {
    return 'hyper-fast';
  }
  if (t.t4 !== null && t.t2 !== null && t.t4 <= 6 && t.t2 <= 3) {
    return 'tier-4-rush';
  }
  if (t.t3 !== null && t.t3 <= 5 && (t.t4 === null || t.t4 >= 9)) {
    return 'tier-3-stall';
  }
  if (t.t2 !== null && t.t3 !== null && t.t2 <= 3 && t.t3 <= 5 && (t.t4 === null || t.t4 <= 7)) {
    return 'standard-fast';
  }
  if (t.t2 !== null && t.t3 !== null && t.t2 >= 4 && t.t3 >= 7) {
    return 'economy';
  }
  if (t.t6 !== null && t.t6 >= 12) {
    return 'late-tier-6';
  }
  return 'other';
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]) {
  if (values.length === 0) return 1;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function averageTier(games: CurveGame[], key: keyof TierTurns) {
  const values = games.map((game) => game.turns[key]).filter((value): value is number => value !== null);
  return values.length > 0 ? Number(average(values).toFixed(2)) : null;
}

function tierAtTurn(turns: TurnRecord[], turnNumber: number) {
  const current = turns
    .filter((turn) => turn.turn_number <= turnNumber)
    .sort((a, b) => b.turn_number - a.turn_number)[0];
  return current?.tavern_tier ?? 1;
}

function medianCurve(games: CurveGame[], turnsByGame: Map<string, TurnRecord[]>) {
  const maxTurn = Math.max(
    14,
    ...games.flatMap((game) => (turnsByGame.get(game.id) ?? []).map((turn) => turn.turn_number))
  );
  return Array.from({ length: maxTurn }, (_, index) => {
    const turn = index + 1;
    const tiers = games.map((game) => tierAtTurn(turnsByGame.get(game.id) ?? [], turn));
    return { turn, tier: Math.min(6, Math.max(1, Math.round(median(tiers)))) };
  });
}

function phaseForTurn(turn: number): 'early' | 'mid' | 'late' {
  if (turn <= 5) return 'early';
  if (turn <= 9) return 'mid';
  return 'late';
}

function parseBoardMinions(value: string | null): BoardMinionDump[] {
  if (!value) return [];
  try {
    return JSON.parse(value) as BoardMinionDump[];
  } catch {
    return [];
  }
}

function commonMinions(
  games: CurveGame[],
  purchasesByGame: Map<string, PurchaseRecord[]>,
  boardTurnsByGame: Map<string, BoardTurnRecord[]>
) {
  const counts = new Map<string, { cardId: string; cardName: string; phase: 'early' | 'mid' | 'late'; count: number }>();
  for (const game of games) {
    for (const purchase of purchasesByGame.get(game.id) ?? []) {
      const phase = phaseForTurn(purchase.turn_number);
      const key = `${purchase.card_id}:${phase}`;
      const current = counts.get(key) ?? { cardId: purchase.card_id, cardName: purchase.card_name, phase, count: 0 };
      current.count += 1;
      counts.set(key, current);
    }
    for (const turn of boardTurnsByGame.get(game.id) ?? []) {
      const phase = phaseForTurn(turn.turn_number);
      const seenInTurn = new Map<string, { cardId: string; cardName: string }>();
      for (const minion of parseBoardMinions(turn.board_minions_json)) {
        const cardId = minion.card_id ?? minion.cardId ?? '';
        const cardName = minion.name ?? minion.Name ?? '';
        if (cardId && cardName) seenInTurn.set(cardId, { cardId, cardName });
      }
      for (const minion of seenInTurn.values()) {
        const key = `${minion.cardId}:${phase}`;
        const current = counts.get(key) ?? { ...minion, phase, count: 0 };
        current.count += 1;
        counts.set(key, current);
      }
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.cardName.localeCompare(b.cardName)).slice(0, 5);
}

export function getLevelingCurves(db: Database.Database) {
  const gameRows = db
    .prepare('SELECT id, started_at, hero_id, hero_name, placement FROM games WHERE placement IS NOT NULL ORDER BY started_at DESC')
    .all() as GameRecord[];
  const knownGameRows = gameRows.filter(hasKnownGameHero);
  const turnRows = db.prepare('SELECT game_id, turn_number, tavern_tier FROM turns ORDER BY turn_number ASC').all() as TurnRecord[];
  const boardTurnRows = db
    .prepare('SELECT game_id, turn_number, board_minions_json FROM turns ORDER BY turn_number ASC')
    .all() as BoardTurnRecord[];
  const purchaseRows = db
    .prepare('SELECT game_id, turn_number, card_id, card_name FROM purchases ORDER BY turn_number ASC')
    .all() as PurchaseRecord[];
  const turnsByGame = new Map<string, TurnRecord[]>();
  for (const turn of turnRows) {
    const list = turnsByGame.get(turn.game_id) ?? [];
    list.push(turn);
    turnsByGame.set(turn.game_id, list);
  }
  const purchasesByGame = new Map<string, PurchaseRecord[]>();
  for (const purchase of purchaseRows) {
    const list = purchasesByGame.get(purchase.game_id) ?? [];
    list.push(purchase);
    purchasesByGame.set(purchase.game_id, list);
  }
  const boardTurnsByGame = new Map<string, BoardTurnRecord[]>();
  for (const turn of boardTurnRows) {
    const list = boardTurnsByGame.get(turn.game_id) ?? [];
    list.push(turn);
    boardTurnsByGame.set(turn.game_id, list);
  }

  const grouped = new Map<string, CurveGame[]>();
  for (const game of knownGameRows) {
    const clean = actionTurns(turnsByGame.get(game.id) ?? []);
    turnsByGame.set(game.id, clean);
    const turns = firstTierTurns(clean);
    if (!hasReliableCurve(turns)) continue;
    const archetype = classifyCurve(turns);
    const list = grouped.get(archetype) ?? [];
    list.push({ ...game, turns });
    grouped.set(archetype, list);
  }

  const completePlacements = knownGameRows.map((game) => game.placement).filter((placement): placement is number => placement !== null);
  const archetypes = [...grouped.entries()]
    .map(([archetype, games]) => {
      const placements = games.map((game) => game.placement).filter((placement): placement is number => placement !== null);
      return {
        archetype,
        games: games.length,
        avgPlacement: Number(average(placements).toFixed(2)),
        top4Rate: Number((placements.filter((placement) => placement <= 4).length / placements.length).toFixed(4)),
        top1Rate: Number((placements.filter((placement) => placement === 1).length / placements.length).toFixed(4)),
        sampleGameIds: games.slice(0, 6).map((game) => game.id),
        avgTurnToTier: {
          t2: averageTier(games, 't2'),
          t3: averageTier(games, 't3'),
          t4: averageTier(games, 't4'),
          t5: averageTier(games, 't5'),
          t6: averageTier(games, 't6')
        },
        medianCurve: medianCurve(games, turnsByGame),
        commonMinions: commonMinions(games, purchasesByGame, boardTurnsByGame)
      };
    })
    .sort((a, b) => archetypeOrder.indexOf(a.archetype) - archetypeOrder.indexOf(b.archetype));

  return {
    baseline: {
      overallAvgPlacement: completePlacements.length ? Number(average(completePlacements).toFixed(2)) : 0,
      totalGames: completePlacements.length
    },
    archetypes
  };
}
