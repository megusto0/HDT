import { Router } from 'express';
import type Database from 'better-sqlite3';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getDataDir } from '../db.js';

type GameDump = {
  id: string;
  started_at: string;
  ended_at?: string | null;
  hero_id: string;
  hero_name: string;
  placement?: number | null;
  mmr_before?: number | null;
  mmr_after?: number | null;
  duration_seconds?: number | null;
  hdt_version?: string | null;
  plugin_version?: string | null;
  raw_json_path?: string | null;
};

type TurnDump = {
  turn_number: number;
  tavern_tier: number;
  gold: number;
  health: number;
  triple_progress?: number | null;
  hand_size?: number | null;
  board_minions?: unknown[];
  shop_minions?: unknown[];
};

type PurchaseDump = {
  turn_number: number;
  card_id: string;
  card_name: string;
  tier: number;
  gold_paid: number;
  source: string;
};

type UpgradeDump = {
  turn_number: number;
  from_tier: number;
  to_tier: number;
  gold_paid: number;
};

type CombatDump = {
  turn_number: number;
  opponent_hero_id?: string | null;
  opponent_board?: unknown[];
  result: string;
  damage_dealt?: number | null;
  damage_taken?: number | null;
};

type TrinketDump = {
  turn_number: number;
  slot: string;
  selected_card_id?: string | null;
  selected_name?: string | null;
  offered_json?: string | null;
  source?: string | null;
};

type Dump = {
  game?: GameDump;
  turns?: TurnDump[];
  purchases?: PurchaseDump[];
  upgrades?: UpgradeDump[];
  combats?: CombatDump[];
  trinkets?: TrinketDump[];
};

export function adminRouter(db: Database.Database) {
  const router = Router();

  router.post('/reimport', (_req, res) => {
    const gamesDir = join(getDataDir(), 'games');
    if (!existsSync(gamesDir)) {
      res.json({ imported: 0 });
      return;
    }

    const tx = db.transaction((files: string[]) => {
      let imported = 0;
      const seedIds = db.prepare("SELECT id FROM games WHERE hdt_version = 'dev-seed'").pluck().all() as string[];
      const deleteChildren = ['trinkets', 'combats', 'upgrades', 'purchases', 'turns'].map((table) =>
        db.prepare(`DELETE FROM ${table} WHERE game_id = ?`)
      );
      const deleteGame = db.prepare('DELETE FROM games WHERE id = ?');
      const upsertGame = db.prepare(
        `INSERT OR REPLACE INTO games
          (id, started_at, ended_at, hero_id, hero_name, placement, mmr_before, mmr_after, duration_seconds, hdt_version, plugin_version, raw_json_path)
         VALUES (@id, @started_at, @ended_at, @hero_id, @hero_name, @placement, @mmr_before, @mmr_after, @duration_seconds, @hdt_version, @plugin_version, @raw_json_path)`
      );
      const insertTurn = db.prepare(
        `INSERT OR REPLACE INTO turns
          (game_id, turn_number, tavern_tier, gold, health, triple_progress, hand_size, board_minions_json, shop_minions_json)
         VALUES (@game_id, @turn_number, @tavern_tier, @gold, @health, @triple_progress, @hand_size, @board_minions_json, @shop_minions_json)`
      );
      const insertPurchase = db.prepare(
        `INSERT INTO purchases (game_id, turn_number, card_id, card_name, tier, gold_paid, source)
         VALUES (@game_id, @turn_number, @card_id, @card_name, @tier, @gold_paid, @source)`
      );
      const insertUpgrade = db.prepare(
        `INSERT INTO upgrades (game_id, turn_number, from_tier, to_tier, gold_paid)
         VALUES (@game_id, @turn_number, @from_tier, @to_tier, @gold_paid)`
      );
      const insertCombat = db.prepare(
        `INSERT INTO combats (game_id, turn_number, opponent_hero_id, opponent_board_json, result, damage_dealt, damage_taken)
         VALUES (@game_id, @turn_number, @opponent_hero_id, @opponent_board_json, @result, @damage_dealt, @damage_taken)`
      );
      const insertTrinket = db.prepare(
        `INSERT OR REPLACE INTO trinkets (game_id, turn_number, slot, selected_card_id, selected_name, offered_json, source)
         VALUES (@game_id, @turn_number, @slot, @selected_card_id, @selected_name, @offered_json, @source)`
      );

      for (const id of seedIds) {
        for (const statement of deleteChildren) statement.run(id);
        deleteGame.run(id);
      }

      for (const file of files) {
        const dump = JSON.parse(readFileSync(join(gamesDir, file), 'utf8')) as Dump;
        if (!dump.game?.id) continue;
        const game = dump.game;
        for (const statement of deleteChildren) statement.run(game.id);
        upsertGame.run(game);
        for (const turn of dump.turns ?? []) {
          insertTurn.run({
            game_id: game.id,
            turn_number: turn.turn_number,
            tavern_tier: turn.tavern_tier,
            gold: turn.gold,
            health: turn.health,
            triple_progress: turn.triple_progress ?? null,
            hand_size: turn.hand_size ?? null,
            board_minions_json: JSON.stringify(turn.board_minions ?? []),
            shop_minions_json: JSON.stringify(turn.shop_minions ?? [])
          });
        }
        for (const purchase of dump.purchases ?? []) {
          insertPurchase.run({ game_id: game.id, ...purchase });
        }
        for (const upgrade of dump.upgrades ?? []) {
          insertUpgrade.run({ game_id: game.id, ...upgrade });
        }
        for (const combat of dump.combats ?? []) {
          insertCombat.run({
            game_id: game.id,
            turn_number: combat.turn_number,
            opponent_hero_id: combat.opponent_hero_id ?? null,
            opponent_board_json: JSON.stringify(combat.opponent_board ?? []),
            result: combat.result,
            damage_dealt: combat.damage_dealt ?? null,
            damage_taken: combat.damage_taken ?? null
          });
        }
        for (const trinket of dump.trinkets ?? []) {
          insertTrinket.run({
            game_id: game.id,
            turn_number: trinket.turn_number,
            slot: trinket.slot ?? 'unknown',
            selected_card_id: trinket.selected_card_id ?? null,
            selected_name: trinket.selected_name ?? null,
            offered_json: trinket.offered_json ?? null,
            source: trinket.source ?? 'json-dump'
          });
        }
        imported += 1;
      }
      return { imported, removedSeedGames: seedIds.length };
    });

    const result = tx(readdirSync(gamesDir).filter((file) => file.endsWith('.json')));
    res.json(result);
  });

  return router;
}
