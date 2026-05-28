import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { classifyCurve, getLevelingCurves } from './levelingCurves.js';
import { openDb } from '../db.js';

describe('leveling curve analytics', () => {
  beforeEach(() => {
    process.env.HDT_BG_TRACKER_DATA = mkdtempSync(join(tmpdir(), 'hdt-bg-test-'));
  });

  it('classifies the pinned archetypes', () => {
    expect(classifyCurve({ t2: 2, t3: 4, t4: 6, t5: 8, t6: null })).toBe('hyper-fast');
    expect(classifyCurve({ t2: 4, t3: 7, t4: 10, t5: null, t6: null })).toBe('economy');
    expect(classifyCurve({ t2: 2, t3: 5, t4: 9, t5: null, t6: null })).toBe('tier-3-stall');
  });

  it('computes top-4 rate from snapshot turns as upgrade action turns', () => {
    const db = openDb();
    db.prepare(
      `INSERT INTO games (id, started_at, hero_id, hero_name, placement)
       VALUES ('g1', '2026-05-01T00:00:00.000Z', 'h1', 'Hero', 2),
              ('g2', '2026-05-02T00:00:00.000Z', 'h1', 'Hero', 6)`
    ).run();
    for (const gameId of ['g1', 'g2']) {
      for (const [turn, tier] of [
        [1, 1],
        [2, 2],
        [4, 3],
        [6, 4]
      ]) {
        db.prepare(
          `INSERT INTO turns (game_id, turn_number, tavern_tier, gold, health)
           VALUES (?, ?, ?, 5, 30)`
        ).run(gameId, turn, tier);
      }
    }

    const stats = getLevelingCurves(db);
    expect(stats.archetypes[0]).toMatchObject({ archetype: 'hyper-fast', games: 2, top4Rate: 0.5 });
    expect(stats.archetypes[0].avgTurnToTier).toMatchObject({ t2: 2, t3: 3, t4: 5 });
    expect(stats.baseline).toMatchObject({ overallAvgPlacement: 4, totalGames: 2 });
    db.close();
  });
});
