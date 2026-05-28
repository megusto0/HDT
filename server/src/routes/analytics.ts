import { Router } from 'express';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import { getLevelingCurves } from '../analytics/levelingCurves.js';
import { getMinionWinrates } from '../analytics/minionWinrate.js';
import { importMissingGameDumps } from '../jsonImport.js';

const minionQuery = z.object({
  phase: z.enum(['early', 'mid', 'late']).default('early'),
  heroId: z.string().optional(),
  minGames: z.coerce.number().int().min(1).max(100).default(5)
});

export function analyticsRouter(db: Database.Database) {
  const router = Router();

  router.get('/leveling-curves', (_req, res) => {
    importMissingGameDumps(db);
    res.json(getLevelingCurves(db));
  });

  router.get('/minions', (req, res) => {
    importMissingGameDumps(db);
    const query = minionQuery.parse(req.query);
    res.json({ minions: getMinionWinrates(db, query) });
  });

  router.get('/mmr-timeline', (_req, res) => {
    importMissingGameDumps(db);
    const points = db
      .prepare('SELECT id, started_at, mmr_after FROM games WHERE mmr_after IS NOT NULL ORDER BY started_at ASC LIMIT 100')
      .all();
    res.json({ points });
  });

  return router;
}
