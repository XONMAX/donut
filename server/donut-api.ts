import { config } from './config.ts';
import { parseMoney } from '../shared/money.ts';

/**
 * Client for the official DonutSMP public API (https://api.donutsmp.net/index.html).
 * The API is read-only: it can tell us a player's balance, but it can't move money.
 * Moving money is done in-game by the bridge bot (/pay).
 *
 * Responses are cached and concurrent requests are coalesced, keeping us well
 * under the 250 requests/minute/key limit.
 */
export interface DonutStats {
  money: number; // cents
  shards: number;
  playtime: number;
  kills: number;
  deaths: number;
}
export interface DonutLookup { username: string; rank: string; location: string }

export class DonutApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

const TTL_MS = 30_000;
const cache = new Map<string, { at: number; value: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

async function request<T>(path: string): Promise<T> {
  if (!config.donutApiKey) throw new DonutApiError('DONUTSMP_API_KEY is not configured', 503);
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as T;
  const pending = inflight.get(path);
  if (pending) return pending as Promise<T>;

  const p = (async () => {
    const res = await fetch(`${config.donutApiBase}${path}`, {
      headers: { Authorization: `Bearer ${config.donutApiKey}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    const body = (await res.json().catch(() => null)) as { status?: number; result?: unknown; message?: string } | null;
    if (!res.ok || !body || (body.status && body.status >= 400)) {
      // DonutSMP answers unknown players with a 500 + "user does not exist" message.
      const notFound = /not exist|could not handle/i.test(body?.message ?? '');
      const status = notFound ? 404 : res.status === 401 || res.status >= 500 ? 502 : res.status;
      throw new DonutApiError(body?.message || `DonutSMP API error ${res.status}`, status);
    }
    cache.set(path, { at: Date.now(), value: body.result });
    return body.result as T;
  })().finally(() => inflight.delete(path));
  inflight.set(path, p);
  return p;
}

const int = (v: unknown) => Number.parseInt(String(v ?? '0'), 10) || 0;

export async function getStats(username: string): Promise<DonutStats> {
  const r = await request<Record<string, string>>(`/v1/stats/${encodeURIComponent(username)}`);
  return {
    money: parseMoney(String(r.money ?? '0')) ?? 0,
    shards: int(r.shards),
    playtime: int(r.playtime),
    kills: int(r.kills),
    deaths: int(r.deaths),
  };
}

export async function lookup(username: string): Promise<DonutLookup | null> {
  try {
    return await request<DonutLookup>(`/v1/lookup/${encodeURIComponent(username)}`);
  } catch (e) {
    // lookup only succeeds for online players
    if (e instanceof DonutApiError && e.status === 404) return null;
    throw e;
  }
}

export const donutApiEnabled = () => Boolean(config.donutApiKey);

export function invalidate(username: string) {
  cache.delete(`/v1/stats/${encodeURIComponent(username)}`);
}
