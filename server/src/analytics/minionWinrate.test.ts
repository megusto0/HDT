import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { openDb } from '../db.js';
import { getMinionWinrates } from './minionWinrate.js';

describe('minion winrate analytics', () => {
  beforeEach(() => {
    process.env.HDT_BG_TRACKER_DATA = mkdtempSync(join(tmpdir(), 'hdt-bg-test-'));
  });

  it('sorts by placement delta against baseline', () => {
    const db = openDb();
    for (const [id, placement] of [
      ['g1', 1],
      ['g2', 2],
      ['g3', 7]
    ] as const) {
      db.prepare(`INSERT INTO games (id, started_at, hero_id, hero_name, placement) VALUES (?, ?, 'h1', 'Hero', ?)`).run(
        id,
        `2026-05-0${placement}T00:00:00.000Z`,
        placement
      );
    }
    db.prepare(
      `INSERT INTO purchases (game_id, turn_number, card_id, card_name, tier, gold_paid, source)
       VALUES ('g1', 3, 'm1', 'Good Minion', 2, 3, 'shop'),
              ('g2', 3, 'm1', 'Good Minion', 2, 3, 'shop'),
              ('g3', 3, 'm2', 'Bad Minion', 2, 3, 'shop')`
    ).run();

    const stats = getMinionWinrates(db, { phase: 'early', minGames: 1 });
    expect(stats[0].cardId).toBe('m1');
    expect(stats[0].deltaVsBaseline).toBeLessThan(0);
    db.close();
  });
});

