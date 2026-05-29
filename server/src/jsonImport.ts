import type Database from 'better-sqlite3';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getDataDir } from './db.js';
import { sanitizeHeroId, sanitizeHeroName } from './heroes.js';

type RawMinion = {
  card_id?: unknown;
  cardId?: unknown;
  name?: unknown;
  Name?: unknown;
  tier?: unknown;
  Tier?: unknown;
  attack?: unknown;
  Attack?: unknown;
  health?: unknown;
  Health?: unknown;
  tribe?: unknown;
  Tribe?: unknown;
  taunt?: unknown;
  Taunt?: unknown;
  divine_shield?: unknown;
  divineShield?: unknown;
  DivineShield?: unknown;
};

type RawTurn = {
  turn_number?: unknown;
  turnNumber?: unknown;
  tavern_tier?: unknown;
  tavernTier?: unknown;
  gold?: unknown;
  health?: unknown;
  triple_progress?: unknown;
  tripleProgress?: unknown;
  hand_size?: unknown;
  handSize?: unknown;
  board_minions?: RawMinion[];
  boardMinions?: RawMinion[];
  shop_minions?: RawMinion[];
  shopMinions?: RawMinion[];
};

type RawDump = {
  game?: Record<string, unknown>;
  turns?: RawTurn[];
  purchases?: Record<string, unknown>[];
  upgrades?: Record<string, unknown>[];
  combats?: Record<string, unknown>[];
  trinkets?: Record<string, unknown>[];
  tracker_events?: Record<string, unknown>[];
  trackerEvents?: Record<string, unknown>[];
};

function text(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function numberOrNull(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function mmrOrNull(value: unknown) {
  const number = numberOrNull(value);
  return number && number > 0 ? number : null;
}

function numberOr(value: unknown, fallback = 0) {
  return numberOrNull(value) ?? fallback;
}

function bool(value: unknown) {
  return value === true;
}

function isPlaceholderTrinket(cardId: string, name: string) {
  const normalizedName = name.trim().toLowerCase();
  return cardId === 'BG30_Trinket_1st' || cardId === 'BG30_Trinket_2nd' || normalizedName === 'lesser trinket' || normalizedName === 'greater trinket';
}

function isImportableTrinket(trinket: Record<string, unknown>) {
  const selectedCardId = text(trinket.selected_card_id ?? trinket.selectedCardId);
  const selectedName = text(trinket.selected_name ?? trinket.selectedName);
  if (!selectedCardId || !selectedName || isPlaceholderTrinket(selectedCardId, selectedName)) return false;

  const offered = trinket.offered_json ?? trinket.offeredJson;
  if (typeof offered !== 'string') return true;
  try {
    const selectedOffer = (JSON.parse(offered) as Record<string, unknown>[]).find((offer) => text(offer.card_id ?? offer.cardId) === selectedCardId);
    const zone = text(selectedOffer?.zone);
    return zone === '' || zone === 'PLAY' || zone === 'SECRET';
  } catch {
    return true;
  }
}

function normalizeMinions(value: RawMinion[] | undefined) {
  return (value ?? [])
    .map((minion) => ({
      card_id: text(minion.card_id ?? minion.cardId),
      name: text(minion.name ?? minion.Name, 'Unknown'),
      tier: numberOr(minion.tier ?? minion.Tier),
      tribe: text(minion.tribe ?? minion.Tribe),
      attack: numberOr(minion.attack ?? minion.Attack),
      health: numberOr(minion.health ?? minion.Health),
      taunt: bool(minion.taunt ?? minion.Taunt),
      divine_shield: bool(minion.divine_shield ?? minion.divineShield ?? minion.DivineShield)
    }))
    .filter((minion) => minion.card_id || minion.name !== 'Unknown');
}

function validTurns(turns: RawTurn[]) {
  const result: (RawTurn & { normalizedBoard: ReturnType<typeof normalizeMinions>; normalizedShop: ReturnType<typeof normalizeMinions> })[] = [];
  let lastTurn = 0;
  let lastTier = 1;
  for (const turn of turns) {
    const turnNumber = numberOr(turn.turn_number ?? turn.turnNumber);
    const tavernTier = numberOr(turn.tavern_tier ?? turn.tavernTier, 1);
    const health = numberOr(turn.health);
    const normalizedBoard = normalizeMinions(turn.board_minions ?? turn.boardMinions);
    const normalizedShop = normalizeMinions(turn.shop_minions ?? turn.shopMinions);
    if (turnNumber <= 0 || turnNumber <= lastTurn) continue;
    if (health <= 0 && normalizedBoard.length === 0) continue;
    if (tavernTier > lastTier + 1) continue;
    if (lastTurn > 0 && tavernTier < lastTier) continue;
    result.push({ ...turn, normalizedBoard, normalizedShop });
    lastTurn = turnNumber;
    lastTier = Math.max(lastTier, tavernTier);
  }
  return result;
}

export function importGameDumps(db: Database.Database) {
  const gamesDir = join(getDataDir(), 'games');
  if (!existsSync(gamesDir)) return { files: 0, games: 0, turns: 0 };

  const files = readdirSync(gamesDir).filter((file) => file.endsWith('.json'));
  const upsertGame = db.prepare(`
    INSERT INTO games (id, started_at, ended_at, hero_id, hero_name, placement, mmr_before, mmr_after, duration_seconds, hdt_version, plugin_version, raw_json_path)
    VALUES (@id, @started_at, @ended_at, @hero_id, @hero_name, @placement, @mmr_before, @mmr_after, @duration_seconds, @hdt_version, @plugin_version, @raw_json_path)
    ON CONFLICT(id) DO UPDATE SET
      started_at = excluded.started_at,
      ended_at = excluded.ended_at,
      hero_id = excluded.hero_id,
      hero_name = excluded.hero_name,
      placement = excluded.placement,
      mmr_before = excluded.mmr_before,
      mmr_after = excluded.mmr_after,
      duration_seconds = excluded.duration_seconds,
      hdt_version = excluded.hdt_version,
      plugin_version = excluded.plugin_version,
      raw_json_path = excluded.raw_json_path
  `);
  const insertTurn = db.prepare(`
    INSERT INTO turns (game_id, turn_number, tavern_tier, gold, health, triple_progress, hand_size, board_minions_json, shop_minions_json)
    VALUES (@game_id, @turn_number, @tavern_tier, @gold, @health, @triple_progress, @hand_size, @board_minions_json, @shop_minions_json)
  `);
  const insertPurchase = db.prepare(`
    INSERT INTO purchases (game_id, turn_number, card_id, card_name, tier, gold_paid, source)
    VALUES (@game_id, @turn_number, @card_id, @card_name, @tier, @gold_paid, @source)
  `);
  const insertUpgrade = db.prepare(`
    INSERT INTO upgrades (game_id, turn_number, from_tier, to_tier, gold_paid)
    VALUES (@game_id, @turn_number, @from_tier, @to_tier, @gold_paid)
  `);
  const insertCombat = db.prepare(`
    INSERT INTO combats (game_id, turn_number, opponent_hero_id, opponent_board_json, result, damage_dealt, damage_taken)
    VALUES (@game_id, @turn_number, @opponent_hero_id, @opponent_board_json, @result, @damage_dealt, @damage_taken)
  `);
  const insertTrinket = db.prepare(`
    INSERT INTO trinkets (game_id, turn_number, slot, selected_card_id, selected_name, offered_json, source)
    VALUES (@game_id, @turn_number, @slot, @selected_card_id, @selected_name, @offered_json, @source)
  `);
  const insertTrackerEvent = db.prepare(`
    INSERT INTO tracker_events
      (game_id, turn_number, event_type, card_id, card_name, entity_id, target_card_id, target_name, target_entity_id, source, raw_json, created_at)
    VALUES
      (@game_id, @turn_number, @event_type, @card_id, @card_name, @entity_id, @target_card_id, @target_name, @target_entity_id, @source, @raw_json, @created_at)
  `);
  const deleteTurns = db.prepare('DELETE FROM turns WHERE game_id = @id');
  const deletePurchases = db.prepare('DELETE FROM purchases WHERE game_id = @id');
  const deleteUpgrades = db.prepare('DELETE FROM upgrades WHERE game_id = @id');
  const deleteCombats = db.prepare('DELETE FROM combats WHERE game_id = @id');
  const deleteTrinkets = db.prepare('DELETE FROM trinkets WHERE game_id = @id');
  const deleteTrackerEvents = db.prepare('DELETE FROM tracker_events WHERE game_id = @id');

  let games = 0;
  let turns = 0;
  const tx = db.transaction(() => {
    for (const file of files) {
      const raw = JSON.parse(readFileSync(join(gamesDir, file), 'utf8')) as RawDump;
      const game = raw.game;
      const id = text(game?.id);
      if (!id) continue;
      const rawJsonPath = text(game?.raw_json_path, join(gamesDir, file));
      upsertGame.run({
        id,
        started_at: text(game?.started_at, new Date(0).toISOString()),
        ended_at: text(game?.ended_at) || null,
        hero_id: sanitizeHeroId(text(game?.hero_id, 'unknown')),
        hero_name: sanitizeHeroName(text(game?.hero_name, 'Unknown Hero')),
        placement: numberOrNull(game?.placement),
        mmr_before: mmrOrNull(game?.mmr_before),
        mmr_after: mmrOrNull(game?.mmr_after),
        duration_seconds: numberOrNull(game?.duration_seconds),
        hdt_version: text(game?.hdt_version) || null,
        plugin_version: text(game?.plugin_version) || null,
        raw_json_path: rawJsonPath
      });
      deleteTurns.run({ id });
      deletePurchases.run({ id });
      deleteUpgrades.run({ id });
      deleteCombats.run({ id });
      deleteTrinkets.run({ id });
      deleteTrackerEvents.run({ id });

      const importedTurns = validTurns(raw.turns ?? []);
      for (const turn of importedTurns) {
        insertTurn.run({
          game_id: id,
          turn_number: numberOr(turn.turn_number ?? turn.turnNumber),
          tavern_tier: numberOr(turn.tavern_tier ?? turn.tavernTier, 1),
          gold: numberOr(turn.gold),
          health: numberOr(turn.health),
          triple_progress: numberOrNull(turn.triple_progress ?? turn.tripleProgress),
          hand_size: numberOrNull(turn.hand_size ?? turn.handSize),
          board_minions_json: JSON.stringify(turn.normalizedBoard),
          shop_minions_json: JSON.stringify(turn.normalizedShop)
        });
        turns += 1;
      }
      for (const purchase of raw.purchases ?? []) {
        const cardId = text(purchase.card_id ?? purchase.cardId);
        const cardName = text(purchase.card_name ?? purchase.cardName);
        if (!cardId || !cardName) continue;
        insertPurchase.run({
          game_id: id,
          turn_number: numberOr(purchase.turn_number ?? purchase.turnNumber),
          card_id: cardId,
          card_name: cardName,
          tier: numberOr(purchase.tier, 1),
          gold_paid: numberOr(purchase.gold_paid ?? purchase.goldPaid, 3),
          source: text(purchase.source, 'json')
        });
      }
      const rawUpgrades = raw.upgrades ?? [];
      if (rawUpgrades.length === 0) {
        let previousTier = 1;
        for (const turn of importedTurns) {
          const tavernTier = numberOr(turn.tavern_tier ?? turn.tavernTier, 1);
          if (tavernTier > previousTier) {
            insertUpgrade.run({
              game_id: id,
              turn_number: numberOr(turn.turn_number ?? turn.turnNumber),
              from_tier: previousTier,
              to_tier: tavernTier,
              gold_paid: 0
            });
          }
          previousTier = Math.max(previousTier, tavernTier);
        }
      }
      for (const upgrade of rawUpgrades) {
        insertUpgrade.run({
          game_id: id,
          turn_number: numberOr(upgrade.turn_number ?? upgrade.turnNumber),
          from_tier: numberOr(upgrade.from_tier ?? upgrade.fromTier, 1),
          to_tier: numberOr(upgrade.to_tier ?? upgrade.toTier, 1),
          gold_paid: numberOr(upgrade.gold_paid ?? upgrade.goldPaid)
        });
      }
      for (const combat of raw.combats ?? []) {
        insertCombat.run({
          game_id: id,
          turn_number: numberOr(combat.turn_number ?? combat.turnNumber),
          opponent_hero_id: text(combat.opponent_hero_id ?? combat.opponentHeroId) || null,
          opponent_board_json: JSON.stringify(normalizeMinions((combat.opponent_board ?? combat.opponentBoard) as RawMinion[] | undefined)),
          result: text(combat.result, 'tie'),
          damage_dealt: numberOrNull(combat.damage_dealt ?? combat.damageDealt),
          damage_taken: numberOrNull(combat.damage_taken ?? combat.damageTaken)
        });
      }
      const seenTrinketCardIds = new Set<string>();
      for (const trinket of raw.trinkets ?? []) {
        if (!isImportableTrinket(trinket)) continue;
        const selectedCardId = text(trinket.selected_card_id ?? trinket.selectedCardId);
        if (seenTrinketCardIds.has(selectedCardId)) continue;
        seenTrinketCardIds.add(selectedCardId);
        const offered = trinket.offered_json ?? trinket.offeredJson ?? '[]';
        insertTrinket.run({
          game_id: id,
          turn_number: numberOr(trinket.turn_number ?? trinket.turnNumber),
          slot: text(trinket.slot, 'unknown'),
          selected_card_id: selectedCardId || null,
          selected_name: text(trinket.selected_name ?? trinket.selectedName) || null,
          offered_json: typeof offered === 'string' ? offered : JSON.stringify(offered),
          source: text(trinket.source, 'json')
        });
      }
      for (const event of raw.tracker_events ?? raw.trackerEvents ?? []) {
        const eventType = text(event.event_type ?? event.eventType);
        if (!eventType) continue;
        const rawJson = event.raw_json ?? event.rawJson;
        insertTrackerEvent.run({
          game_id: id,
          turn_number: numberOr(event.turn_number ?? event.turnNumber),
          event_type: eventType,
          card_id: text(event.card_id ?? event.cardId) || null,
          card_name: text(event.card_name ?? event.cardName) || null,
          entity_id: numberOrNull(event.entity_id ?? event.entityId),
          target_card_id: text(event.target_card_id ?? event.targetCardId) || null,
          target_name: text(event.target_name ?? event.targetName) || null,
          target_entity_id: numberOrNull(event.target_entity_id ?? event.targetEntityId),
          source: text(event.source, 'json'),
          raw_json: typeof rawJson === 'string' ? rawJson : rawJson ? JSON.stringify(rawJson) : null,
          created_at: text(event.created_at ?? event.createdAt, new Date(0).toISOString())
        });
      }
      games += 1;
    }
  });
  tx();
  return { files: files.length, games, turns };
}

export function importMissingGameDumps(db: Database.Database) {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM games g
       WHERE g.raw_json_path IS NOT NULL
         AND g.placement IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM turns t WHERE t.game_id = g.id)`
    )
    .get() as { count: number };
  return row.count > 0 ? importGameDumps(db) : { files: 0, games: 0, turns: 0 };
}

export function importGameDumpIfMissing(db: Database.Database, gameId: string) {
  const row = db
    .prepare(
      `SELECT COUNT(t.id) AS turns, g.raw_json_path AS rawJsonPath
       FROM games g
       LEFT JOIN turns t ON t.game_id = g.id
       WHERE g.id = ?
       GROUP BY g.id`
    )
    .get(gameId) as { turns: number; rawJsonPath: string | null } | undefined;
  if (!row || row.turns > 0 || !row.rawJsonPath || !existsSync(row.rawJsonPath)) {
    return { files: 0, games: 0, turns: 0 };
  }
  return importGameDumps(db);
}
