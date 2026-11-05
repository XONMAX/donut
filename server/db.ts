import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { config } from './config.ts';

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY,
  username    TEXT NOT NULL,
  username_lc TEXT NOT NULL UNIQUE,
  balance     INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  client_seed TEXT NOT NULL,
  nonce       INTEGER NOT NULL DEFAULT 0,
  wagered     INTEGER NOT NULL DEFAULT 0,
  profit      INTEGER NOT NULL DEFAULT 0,
  banned      INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS link_requests (
  id           TEXT PRIMARY KEY,
  session_hash TEXT NOT NULL,
  username     TEXT NOT NULL,
  username_lc  TEXT NOT NULL,
  code         TEXT NOT NULL UNIQUE,
  status       TEXT NOT NULL DEFAULT 'pending',
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS link_requests_session ON link_requests(session_hash);

CREATE TABLE IF NOT EXISTS seeds (
  hash        TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seed        TEXT NOT NULL,
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL,
  revealed_at INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS seeds_active ON seeds(user_id) WHERE active = 1;

CREATE TABLE IF NOT EXISTS transactions (
  id            INTEGER PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id),
  type          TEXT NOT NULL,
  amount        INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  ref           TEXT,
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS transactions_user ON transactions(user_id, id DESC);

CREATE TABLE IF NOT EXISTS deposits (
  id          INTEGER PRIMARY KEY,
  event_id    TEXT NOT NULL UNIQUE,
  username    TEXT NOT NULL,
  username_lc TEXT NOT NULL,
  amount      INTEGER NOT NULL CHECK (amount > 0),
  status      TEXT NOT NULL,
  user_id     INTEGER REFERENCES users(id),
  created_at  INTEGER NOT NULL,
  credited_at INTEGER
);
CREATE INDEX IF NOT EXISTS deposits_unclaimed ON deposits(username_lc) WHERE status = 'unclaimed';

CREATE TABLE IF NOT EXISTS withdrawals (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  username   TEXT NOT NULL,
  amount     INTEGER NOT NULL CHECK (amount > 0),
  status     TEXT NOT NULL,
  error      TEXT,
  attempts   INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS withdrawals_status ON withdrawals(status, id);
CREATE INDEX IF NOT EXISTS withdrawals_user ON withdrawals(user_id, id DESC);

CREATE TABLE IF NOT EXISTS bets (
  id               INTEGER PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES users(id),
  game             TEXT NOT NULL,
  amount           INTEGER NOT NULL,
  payout           INTEGER NOT NULL,
  multiplier       REAL NOT NULL,
  params           TEXT NOT NULL,
  outcome          TEXT NOT NULL,
  server_seed_hash TEXT NOT NULL,
  client_seed      TEXT NOT NULL,
  nonce            INTEGER NOT NULL,
  created_at       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS bets_user ON bets(user_id, id DESC);
`;

export function openDb(path = config.dbPath): DatabaseSync {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);
  return db;
}

export let db = openDb();

/** Swap the database (tests use an in-memory one). */
export function useDb(next: DatabaseSync) {
  db = next;
  stmtCache.clear();
}

const stmtCache = new Map<string, ReturnType<DatabaseSync['prepare']>>();
function stmt(sql: string) {
  let s = stmtCache.get(sql);
  if (!s) {
    s = db.prepare(sql);
    stmtCache.set(sql, s);
  }
  return s;
}

export const q = {
  get<T>(sql: string, ...params: SQLInputValue[]): T | undefined {
    return stmt(sql).get(...params) as T | undefined;
  },
  all<T>(sql: string, ...params: SQLInputValue[]): T[] {
    return stmt(sql).all(...params) as T[];
  },
  run(sql: string, ...params: SQLInputValue[]) {
    return stmt(sql).run(...params);
  },
};

let depth = 0;
/** Runs fn atomically. node:sqlite is synchronous, so no other request can interleave. */
export function tx<T>(fn: () => T): T {
  if (depth > 0) return fn();
  db.exec('BEGIN IMMEDIATE');
  depth++;
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  } finally {
    depth--;
  }
}

export const now = () => Date.now();

export interface UserRow {
  id: number;
  username: string;
  username_lc: string;
  balance: number;
  client_seed: string;
  nonce: number;
  wagered: number;
  profit: number;
  banned: number;
  created_at: number;
}
