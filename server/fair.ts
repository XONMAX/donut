import { createHash, createHmac, randomBytes } from 'node:crypto';
import { bytesToFloats, fairFloats, resolveOutcome, FLOATS_NEEDED, type BetParams, type GameId } from '../shared/fair.ts';
import { q, tx, now } from './db.ts';

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const hmac = (key: string, msg: string) => new Uint8Array(createHmac('sha256', key).update(msg).digest());

export const newServerSeed = () => randomBytes(32).toString('hex');
export const newClientSeed = () => randomBytes(8).toString('hex');

export interface SeedRow { hash: string; user_id: number; seed: string; active: number; created_at: number; revealed_at: number | null }

export function createActiveSeed(userId: number): SeedRow {
  const seed = newServerSeed();
  const row: SeedRow = { hash: sha256(seed), user_id: userId, seed, active: 1, created_at: now(), revealed_at: null };
  q.run('INSERT INTO seeds (hash, user_id, seed, active, created_at) VALUES (?, ?, ?, 1, ?)', row.hash, userId, seed, row.created_at);
  return row;
}

export function activeSeed(userId: number): SeedRow {
  return q.get<SeedRow>('SELECT * FROM seeds WHERE user_id = ? AND active = 1', userId) ?? createActiveSeed(userId);
}

/** Reveals the current server seed, starts a new one and resets the nonce. */
export function rotateSeed(userId: number, clientSeed?: string) {
  return tx(() => {
    const prev = activeSeed(userId);
    q.run('UPDATE seeds SET active = 0, revealed_at = ? WHERE hash = ?', now(), prev.hash);
    const next = createActiveSeed(userId);
    q.run('UPDATE users SET nonce = 0, client_seed = COALESCE(?, client_seed) WHERE id = ?', clientSeed ?? null, userId);
    return { revealed: { seed: prev.seed, hash: prev.hash }, nextHash: next.hash };
  });
}

/** Seed lookups are synchronous so the whole bet can run inside one SQLite transaction. */
export function rollSync(game: GameId, params: BetParams, serverSeed: string, clientSeed: string, nonce: number) {
  // fairFloats() is async for WebCrypto compatibility; this is the same algorithm run synchronously.
  const floats: number[] = [];
  for (let round = 0; floats.length < FLOATS_NEEDED[game]; round++) {
    floats.push(...bytesToFloats(hmac(serverSeed, `${clientSeed}:${nonce}:${round}`)));
  }
  return resolveOutcome(game, params, floats);
}

/** Async variant using the shared implementation — used by tests to prove both paths agree. */
export async function rollShared(game: GameId, params: BetParams, serverSeed: string, clientSeed: string, nonce: number) {
  return resolveOutcome(game, params, await fairFloats(hmac, serverSeed, clientSeed, nonce, FLOATS_NEEDED[game]));
}
