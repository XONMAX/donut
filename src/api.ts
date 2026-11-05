import type { GameId, Outcome, BetParams } from '../shared/fair.ts';

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function api<T>(path: string, init?: { method?: string; body?: unknown; headers?: Record<string, string> }): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: init?.method ?? (init?.body !== undefined ? 'POST' : 'GET'),
    credentials: 'same-origin',
    headers: { Accept: 'application/json', ...(init?.body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...init?.headers },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((data as { error?: string }).error ?? `Request failed (${res.status})`, res.status);
  return data as T;
}

export interface User { id: number; username: string; balance: number; wagered: number; profit: number; createdAt: number }
export interface PublicConfig {
  botUsername: string;
  bridge: { kind: 'mock' | 'mineflayer'; online: boolean };
  donutApi: boolean;
  limits: { minBet: number; maxBet: number; minDeposit: number; minWithdraw: number; withdrawReviewAt: number; depositReviewAt: number };
  payouts: Record<GameId, number>;
}
export interface PublicBet { id: number; username: string; game: GameId; amount: number; payout: number; multiplier: number; outcome: Outcome; createdAt: number }
export interface MyBet extends PublicBet { params: BetParams; serverSeedHash: string; serverSeed: string | null; clientSeed: string; nonce: number }
export interface BetResult { bet: PublicBet; balance: number; fair: { serverSeedHash: string; clientSeed: string; nonce: number } }
export interface LinkStart { username: string; code: string; expiresAt: number; botUsername: string; preview: { money: number } | null }

export const headUrl = (username: string, size = 32) =>
  `https://mc-heads.net/avatar/${encodeURIComponent(username.replace(/^\./, ''))}/${size}`;
