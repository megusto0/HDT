import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { ulid } from 'ulid';
import { getDataDir, getDbPath, openDb } from './db.js';
import type { BoardMinion } from './types.js';

if (!process.env.HDT_BG_TRACKER_DATA) {
  process.env.HDT_BG_TRACKER_DATA = join(process.cwd(), '.dev-data');
}

const dataDir = getDataDir();
mkdirSync(dataDir, { recursive: true });
rmSync(getDbPath(), { force: true });
rmSync(`${getDbPath()}-wal`, { force: true });
rmSync(`${getDbPath()}-shm`, { force: true });

const db = openDb();

const heroes = [
  { id: 'TB_BaconShop_HERO_59', name: 'Капитан Кривоклык' },
  { id: 'TB_BaconShop_HERO_67', name: 'Миллхаус Манашторм' },
  { id: 'TB_BaconShop_HERO_70', name: 'Сайлас Новолуний' },
  { id: 'TB_BaconShop_HERO_25', name: 'А. Ф. Ка' },
  { id: 'TB_BaconShop_HERO_33', name: 'Рено Джексон' },
  { id: 'TB_BaconShop_HERO_90', name: 'Королева Азшара' }
];

const minions = [
  { cardId: 'BG31_807', name: 'Бесшабашный геомант', tier: 1, tribe: 'Elemental' },
  { cardId: 'BG29_872', name: 'Мурлок-разведчик', tier: 2, tribe: 'Murloc' },
  { cardId: 'BG30_116', name: 'Ночной кошмар', tier: 3, tribe: 'Beast' },
  { cardId: 'BG31_185', name: 'Золотой ловец', tier: 4, tribe: 'Pirate' },
  { cardId: 'BG32_291', name: 'Хроматический дракон', tier: 5, tribe: 'Dragon' },
  { cardId: 'BG30_543', name: 'Заводной страж', tier: 3, tribe: 'Mech' },
  { cardId: 'BG31_450', name: 'Певица таверны', tier: 4, tribe: 'Neutral' }
];

function board(seed: number, count: number): BoardMinion[] {
  return Array.from({ length: count }, (_, index) => {
    const minion = minions[(seed + index) % minions.length];
    return {
      cardId: minion.cardId,
      name: minion.name,
      tier: minion.tier,
      tribe: minion.tribe,
      attack: 2 + seed + index * 2,
      health: 3 + seed + index,
      taunt: index === 1,
      divineShield: index === 2
    };
  });
}

const insertGame = db.prepare(`
  INSERT INTO games (id, started_at, ended_at, hero_id, hero_name, placement, mmr_before, mmr_after, duration_seconds, hdt_version, plugin_version, raw_json_path)
  VALUES (@id, @started_at, @ended_at, @hero_id, @hero_name, @placement, @mmr_before, @mmr_after, @duration_seconds, @hdt_version, @plugin_version, @raw_json_path)
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

const gamesToCreate = 14;
const tx = db.transaction(() => {
  const baseStartedAt = Date.now() - 1000 * 60 * 60 * 24;
  for (let i = 0; i < gamesToCreate; i += 1) {
    const hero = heroes[i % heroes.length];
    const started = new Date(baseStartedAt - i * 1000 * 60 * 90);
    const placement = [2, 5, 1, 4, 7, 3, 6, 2, 8, 4, 1, 5, 3, 6][i];
    const mmrBefore = 6200 + i * 18;
    const mmrDelta = placement <= 4 ? 75 - placement * 8 : -(placement * 11);
    const id = ulid(started.getTime());
    insertGame.run({
      id,
      started_at: started.toISOString(),
      ended_at: new Date(started.getTime() + 1000 * 60 * (18 + (i % 8))).toISOString(),
      hero_id: hero.id,
      hero_name: hero.name,
      placement,
      mmr_before: mmrBefore,
      mmr_after: mmrBefore + mmrDelta,
      duration_seconds: 1080 + i * 55,
      hdt_version: 'dev-seed',
      plugin_version: '0.1.0',
      raw_json_path: join(dataDir, 'games', `${id}.json`)
    });

    const tierPattern = i % 4;
    for (let turn = 1; turn <= 12; turn += 1) {
      const tavernTier =
        tierPattern === 0
          ? turn >= 10
            ? 6
            : turn >= 7
              ? 5
              : turn >= 5
                ? 4
                : turn >= 3
                  ? 3
                  : turn >= 2
                    ? 2
                    : 1
          : tierPattern === 1
            ? turn >= 12
              ? 6
              : turn >= 8
                ? 4
                : turn >= 5
                  ? 3
                  : turn >= 3
                    ? 2
                    : 1
            : tierPattern === 2
              ? turn >= 13
                ? 6
                : turn >= 9
                  ? 5
                  : turn >= 7
                    ? 4
                    : turn >= 5
                      ? 3
                      : turn >= 4
                        ? 2
                        : 1
              : turn >= 12
                ? 6
                : turn >= 9
                  ? 4
                  : turn >= 4
                    ? 3
                    : turn >= 2
                      ? 2
                      : 1;
      insertTurn.run({
        game_id: id,
        turn_number: turn,
        tavern_tier: tavernTier,
        gold: Math.min(10, turn + 2),
        health: Math.max(1, 40 - turn * (placement > 4 ? 3 : 1) - (i % 3)),
        triple_progress: turn % 5 === 0 ? 1 : 0,
        hand_size: turn % 3,
        board_minions_json: JSON.stringify(board(i + turn, Math.min(7, Math.max(1, turn - 1)))),
        shop_minions_json: JSON.stringify(board(i + turn + 2, Math.min(7, 3 + Math.floor(turn / 3))))
      });
    }

    for (let turn = 2; turn <= 8; turn += 1) {
      const minion = minions[(i + turn) % minions.length];
      insertPurchase.run({
        game_id: id,
        turn_number: turn,
        card_id: minion.cardId,
        card_name: minion.name,
        tier: minion.tier,
        gold_paid: 3,
        source: turn === 6 && i % 3 === 0 ? 'discover' : 'shop'
      });
    }
    for (const [turn, fromTier, toTier, goldPaid] of [
      [2, 1, 2, 4],
      [5 + (i % 2), 2, 3, 5],
      [7 + (i % 3), 3, 4, 6]
    ]) {
      insertUpgrade.run({ game_id: id, turn_number: turn, from_tier: fromTier, to_tier: toTier, gold_paid: goldPaid });
    }
    for (let turn = 3; turn <= 11; turn += 2) {
      const loss = placement > 4 && turn > 5;
      insertCombat.run({
        game_id: id,
        turn_number: turn,
        opponent_hero_id: heroes[(i + turn) % heroes.length].id,
        opponent_board_json: JSON.stringify(board(i + turn + 5, Math.min(7, Math.floor(turn / 2)))),
        result: loss ? 'loss' : turn % 4 === 1 ? 'tie' : 'win',
        damage_dealt: loss ? 0 : 3 + turn,
        damage_taken: loss ? 2 + turn : 0
      });
    }
  }
});

tx();
db.close();
console.log(`Seeded ${gamesToCreate} games into ${getDbPath()}`);
