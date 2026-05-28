import Database from 'better-sqlite3';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDir = dirname(fileURLToPath(import.meta.url));
const schemaPath = [join(moduleDir, 'schema.sql'), join(moduleDir, '../src/schema.sql')].find((path) => existsSync(path));

export function getDataDir() {
  return process.env.HDT_BG_TRACKER_DATA ?? join(process.env.APPDATA ?? process.cwd(), 'HDTBgTracker');
}

export function getDbPath() {
  return join(getDataDir(), 'stats.db');
}

export function openDb(options: Database.Options = {}) {
  const dataDir = getDataDir();
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(join(dataDir, 'games'), { recursive: true });
  const db = new Database(getDbPath(), options);
  db.pragma('foreign_keys = ON');
  if (!options.readonly) {
    db.pragma('journal_mode = WAL');
    if (!schemaPath) {
      throw new Error('schema.sql not found');
    }
    db.exec(readFileSync(schemaPath, 'utf8'));
  }
  return db;
}
