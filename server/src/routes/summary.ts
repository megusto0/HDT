import { Router } from 'express';
import type Database from 'better-sqlite3';
import { importMissingGameDumps } from '../jsonImport.js';
import { hasKnownGameHero, hasKnownHeroStat, sanitizeGameHero, sanitizeHeroStat } from '../heroes.js';

function sanitizeMmrGame<T extends { mmr_before?: unknown; mmr_after?: unknown }>(game: T): T {
  return {
    ...game,
    mmr_before: typeof game.mmr_before === 'number' && game.mmr_before > 0 ? game.mmr_before : null,
    mmr_after: typeof game.mmr_after === 'number' && game.mmr_after > 0 ? game.mmr_after : null
  };
}

export function summaryRouter(db: Database.Database) {
  const router = Router();

  router.get('/', (_req, res) => {
    importMissingGameDumps(db);
    const totals = db
      .prepare(
        `SELECT
          COUNT(*) AS totalGames,
          AVG(placement) AS avgPlacement,
          SUM(CASE WHEN placement <= 4 THEN 1 ELSE 0 END) AS top4,
          SUM(CASE WHEN placement = 1 THEN 1 ELSE 0 END) AS top1
        FROM games WHERE placement IS NOT NULL`
      )
      .get() as { totalGames: number; avgPlacement: number | null; top4: number | null; top1: number | null };
    const latest = db
      .prepare('SELECT mmr_after FROM games WHERE mmr_after IS NOT NULL AND mmr_after > 0 ORDER BY started_at DESC LIMIT 1')
      .get() as { mmr_after: number } | undefined;
    const recentGames = db
      .prepare(
        `SELECT id, started_at, hero_id, hero_name, placement, mmr_before, mmr_after, duration_seconds
         FROM games WHERE placement IS NOT NULL ORDER BY started_at DESC LIMIT 10`
      )
      .all();
    const heroStats = db
      .prepare(
        `SELECT hero_id AS heroId, hero_name AS heroName, COUNT(*) AS games, AVG(placement) AS avgPlacement,
          AVG(CASE WHEN placement <= 4 THEN 1.0 ELSE 0.0 END) AS top4Rate,
          AVG(CASE WHEN placement = 1 THEN 1.0 ELSE 0.0 END) AS top1Rate
         FROM games WHERE placement IS NOT NULL
         GROUP BY hero_id, hero_name
         ORDER BY games DESC, avgPlacement ASC
         LIMIT 10`
      )
      .all();
    const mmrTimeline = db
      .prepare('SELECT id, started_at, mmr_after FROM games WHERE mmr_after IS NOT NULL AND mmr_after > 0 ORDER BY started_at ASC LIMIT 100')
      .all();

    const totalGames = totals.totalGames ?? 0;
    res.json({
      totalGames,
      avgPlacement: totals.avgPlacement ? Number(totals.avgPlacement.toFixed(2)) : null,
      top4Rate: totalGames > 0 ? Number(((totals.top4 ?? 0) / totalGames).toFixed(4)) : 0,
      top1Rate: totalGames > 0 ? Number(((totals.top1 ?? 0) / totalGames).toFixed(4)) : 0,
      latestMmr: latest?.mmr_after ?? null,
      recentGames: (recentGames as any[]).filter(hasKnownGameHero).map(sanitizeGameHero).map(sanitizeMmrGame),
      heroStats: (heroStats as any[]).filter(hasKnownHeroStat).map(sanitizeHeroStat),
      mmrTimeline
    });
  });

  return router;
}
