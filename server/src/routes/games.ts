import { Router } from 'express';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import { importGameDumpIfMissing, importMissingGameDumps } from '../jsonImport.js';
import { hasKnownGameHero, sanitizeGameHero } from '../heroes.js';

const listQuery = z.object({
  hero: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  includeIncomplete: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  limit: z.coerce.number().int().min(1).max(200).default(50)
});

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function sanitizeMmrGame<T extends { mmr_before?: unknown; mmr_after?: unknown }>(game: T): T {
  return {
    ...game,
    mmr_before: typeof game.mmr_before === 'number' && game.mmr_before > 0 ? game.mmr_before : null,
    mmr_after: typeof game.mmr_after === 'number' && game.mmr_after > 0 ? game.mmr_after : null
  };
}

function normalizeMinions(value: string | null) {
  return parseJson<any[]>(value, []).map((minion) => ({
    cardId: minion.cardId ?? minion.CardId ?? minion.card_id ?? '',
    name: minion.name ?? minion.Name ?? 'Unknown',
    tier: minion.tier ?? minion.Tier ?? 0,
    tribe: minion.tribe ?? minion.Tribe ?? '',
    attack: minion.attack ?? minion.Attack ?? 0,
    health: minion.health ?? minion.Health ?? 0,
    taunt: minion.taunt ?? minion.Taunt ?? false,
    divineShield: minion.divineShield ?? minion.DivineShield ?? minion.divine_shield ?? false
  }));
}

function trinketBaseId(value: unknown) {
  return String(value ?? '').replace(/t$/, '');
}

function isPlaceholderTrinketOffer(offer: { cardId: string; name: string }) {
  const normalizedName = String(offer.name).trim().toLowerCase();
  return offer.cardId === 'BG30_Trinket_1st'
    || offer.cardId === 'BG30_Trinket_2nd'
    || normalizedName === 'lesser trinket'
    || normalizedName === 'greater trinket';
}

function normalizeTrinketOffers(value: string | null, selectedCardId?: string | null) {
  const seen = new Set<string>();
  const selectedBaseId = trinketBaseId(selectedCardId);
  return parseJson<any[]>(value, [])
    .map((offer) => ({
      cardId: offer.cardId ?? offer.card_id ?? '',
      name: offer.name ?? offer.Name ?? 'Unknown',
      controller: offer.controller ?? null,
      zone: offer.zone ?? null
    }))
    .filter((offer) => {
      const normalizedName = String(offer.name).trim().toLowerCase();
      const baseId = trinketBaseId(offer.cardId);
      if (!offer.cardId && !offer.name) return false;
      if (isPlaceholderTrinketOffer(offer)) return false;
      if (selectedBaseId && baseId === selectedBaseId) return false;
      const key = `${baseId}:${normalizedName}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 3);
}

function derivedUpgrades(turns: any[]) {
  const upgrades: any[] = [];
  let previousTier = 1;
  for (const turn of turns) {
    const tavernTier = Number(turn.tavern_tier ?? 1);
    if (tavernTier > previousTier) {
      upgrades.push({
        id: -upgrades.length - 1,
        game_id: turn.game_id,
        turn_number: turn.turn_number,
        from_tier: previousTier,
        to_tier: tavernTier,
        gold_paid: 0
      });
    }
    previousTier = Math.max(previousTier, tavernTier);
  }
  return upgrades;
}

export function gamesRouter(db: Database.Database) {
  const router = Router();

  router.get('/', (req, res) => {
    importMissingGameDumps(db);
    const query = listQuery.parse(req.query);
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (query.hero) {
      clauses.push('hero_id = ?');
      params.push(query.hero);
    }
    if (query.from) {
      clauses.push('started_at >= ?');
      params.push(query.from);
    }
    if (query.to) {
      clauses.push('started_at <= ?');
      params.push(query.to);
    }
    if (!query.includeIncomplete) {
      clauses.push('placement IS NOT NULL');
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = db
      .prepare(
        `SELECT id, started_at, ended_at, hero_id, hero_name, placement, mmr_before, mmr_after, duration_seconds
         FROM games ${where} ORDER BY started_at DESC LIMIT ?`
      )
      .all(...params, query.limit);
    res.json({ games: (rows as any[]).filter(hasKnownGameHero).map(sanitizeGameHero).map(sanitizeMmrGame) });
  });

  router.get('/:id', (req, res) => {
    importGameDumpIfMissing(db, req.params.id);
    const game = db.prepare('SELECT * FROM games WHERE id = ?').get(req.params.id);
    if (!game) {
      res.status(404).json({ error: 'Game not found' });
      return;
    }
    if (!hasKnownGameHero(game as any)) {
      res.status(404).json({ error: 'Game has no resolved player hero' });
      return;
    }
    const turns = (db.prepare('SELECT * FROM turns WHERE game_id = ? ORDER BY turn_number ASC').all(req.params.id) as any[]).map(
      (turn) => ({
        ...turn,
        board: normalizeMinions(turn.board_minions_json),
        shop: normalizeMinions(turn.shop_minions_json)
      })
    );
    const purchases = db.prepare('SELECT * FROM purchases WHERE game_id = ? ORDER BY turn_number ASC').all(req.params.id);
    const storedUpgrades = db.prepare('SELECT * FROM upgrades WHERE game_id = ? ORDER BY turn_number ASC').all(req.params.id) as any[];
    const upgrades = storedUpgrades.length ? storedUpgrades : derivedUpgrades(turns);
    const combats = (db.prepare('SELECT * FROM combats WHERE game_id = ? ORDER BY turn_number ASC').all(req.params.id) as any[]).map(
      (combat) => ({
        ...combat,
        opponentBoard: normalizeMinions(combat.opponent_board_json)
      })
    );
    const trinkets = (db.prepare('SELECT * FROM trinkets WHERE game_id = ? ORDER BY turn_number ASC, slot ASC').all(req.params.id) as any[]).map(
      (trinket) => ({
        ...trinket,
        offered: normalizeTrinketOffers(trinket.offered_json, trinket.selected_card_id)
      })
    );
    const trackerEvents = db
      .prepare('SELECT * FROM tracker_events WHERE game_id = ? ORDER BY turn_number ASC, id ASC')
      .all(req.params.id);
    res.json({ game: sanitizeMmrGame(sanitizeGameHero(game as any)), turns, purchases, upgrades, combats, trinkets, trackerEvents });
  });

  return router;
}
