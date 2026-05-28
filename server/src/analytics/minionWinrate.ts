import type Database from 'better-sqlite3';

export type Phase = 'early' | 'mid' | 'late';

export type MinionStat = {
  cardId: string;
  cardName: string;
  tier: number;
  phase: Phase;
  games: number;
  avgPlacement: number;
  top4Rate: number;
  top1Rate: number;
  deltaVsBaseline: number;
};

type MinionRow = {
  card_id: string;
  card_name: string;
  tier: number;
  placement: number;
  game_id: string;
};

type TurnRow = {
  game_id: string;
  placement: number;
  board_minions_json: string | null;
};

type BoardMinionDump = {
  cardId?: string;
  card_id?: string;
  name?: string;
  Name?: string;
  tier?: number;
  Tier?: number;
};

function phaseWhere(phase: Phase) {
  if (phase === 'early') return 'p.turn_number BETWEEN 2 AND 4';
  if (phase === 'mid') return 'p.turn_number BETWEEN 5 AND 7';
  return 'p.turn_number >= 8';
}

function turnPhaseWhere(phase: Phase) {
  if (phase === 'early') return 't.turn_number BETWEEN 2 AND 4';
  if (phase === 'mid') return 't.turn_number BETWEEN 5 AND 7';
  return 't.turn_number >= 8';
}

function average(values: number[]) {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function knownHeroSql(alias = 'g') {
  return `lower(coalesce(${alias}.hero_id, '')) != 'unknown'
    AND lower(coalesce(${alias}.hero_name, '')) != 'unknown hero'
    AND lower(coalesce(${alias}.hero_id, '')) NOT LIKE '%kel%'
    AND lower(coalesce(${alias}.hero_name, '')) NOT LIKE '%kel%'
    AND lower(coalesce(${alias}.hero_id, '')) NOT LIKE '%baconphhero%'
    AND lower(coalesce(${alias}.hero_name, '')) NOT LIKE '%baconphhero%'
    AND lower(coalesce(${alias}.hero_id, '')) NOT LIKE '%hero_ph%'
    AND lower(coalesce(${alias}.hero_name, '')) NOT LIKE '%hero_ph%'`;
}

function parseBoardMinions(value: string | null): BoardMinionDump[] {
  if (!value) return [];
  try {
    return JSON.parse(value) as BoardMinionDump[];
  } catch {
    return [];
  }
}

export function getMinionWinrates(db: Database.Database, options: { phase: Phase; minGames: number; heroId?: string }): MinionStat[] {
  const baselineParams: unknown[] = [];
  let baselineSql = `SELECT AVG(placement) AS avgPlacement FROM games g WHERE placement IS NOT NULL AND ${knownHeroSql('g')}`;
  if (options.heroId) {
    baselineSql += ' AND hero_id = ?';
    baselineParams.push(options.heroId);
  }
  const baseline = (db.prepare(baselineSql).get(...baselineParams) as { avgPlacement: number | null }).avgPlacement ?? 0;

  const params: unknown[] = [];
  let sql = `
    SELECT DISTINCT p.card_id, p.card_name, p.tier, g.placement, g.id AS game_id
    FROM purchases p
    JOIN games g ON g.id = p.game_id
    WHERE g.placement IS NOT NULL AND ${knownHeroSql('g')} AND ${phaseWhere(options.phase)}
  `;
  if (options.heroId) {
    sql += ' AND g.hero_id = ?';
    params.push(options.heroId);
  }

  const purchaseRows = db.prepare(sql).all(...params) as MinionRow[];

  const turnParams: unknown[] = [];
  let turnSql = `
    SELECT t.game_id, t.board_minions_json, g.placement
    FROM turns t
    JOIN games g ON g.id = t.game_id
    WHERE g.placement IS NOT NULL AND ${knownHeroSql('g')} AND ${turnPhaseWhere(options.phase)}
  `;
  if (options.heroId) {
    turnSql += ' AND g.hero_id = ?';
    turnParams.push(options.heroId);
  }

  const boardRows = (db.prepare(turnSql).all(...turnParams) as TurnRow[]).flatMap((turn) =>
    parseBoardMinions(turn.board_minions_json)
      .map((minion) => ({
        card_id: minion.card_id ?? minion.cardId ?? '',
        card_name: minion.name ?? minion.Name ?? 'Unknown',
        tier: minion.tier ?? minion.Tier ?? 0,
        placement: turn.placement,
        game_id: turn.game_id
      }))
      .filter((minion) => minion.card_id && minion.card_name)
  );

  const rows = [...purchaseRows, ...boardRows];
  const uniqueRows = [...new Map(rows.map((row) => [`${row.game_id}:${row.card_id}:${row.tier}`, row])).values()];
  const grouped = new Map<string, MinionRow[]>();
  for (const row of uniqueRows) {
    const key = `${row.card_id}:${row.tier}`;
    const list = grouped.get(key) ?? [];
    list.push(row);
    grouped.set(key, list);
  }

  return [...grouped.values()]
    .map((list) => {
      const placements = list.map((row) => row.placement);
      const avgPlacement = average(placements);
      return {
        cardId: list[0].card_id,
        cardName: list[0].card_name,
        tier: list[0].tier,
        phase: options.phase,
        games: new Set(list.map((row) => row.game_id)).size,
        avgPlacement: Number(avgPlacement.toFixed(2)),
        top4Rate: Number((placements.filter((placement) => placement <= 4).length / placements.length).toFixed(4)),
        top1Rate: Number((placements.filter((placement) => placement === 1).length / placements.length).toFixed(4)),
        deltaVsBaseline: Number((avgPlacement - baseline).toFixed(2))
      };
    })
    .filter((stat) => stat.games >= options.minGames)
    .sort((a, b) => a.deltaVsBaseline - b.deltaVsBaseline || b.games - a.games);
}
