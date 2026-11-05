import { q, tx, now, type UserRow } from './db.ts';
import { applyBalance } from './ledger.ts';
import { activeSeed, rollSync } from './fair.ts';
import { config } from './config.ts';
import { payoutFor, type BetParams, type GameId, type Outcome } from '../shared/fair.ts';

export class BetError extends Error {}

export interface BetRow {
  id: number; user_id: number; game: GameId; amount: number; payout: number; multiplier: number;
  params: string; outcome: string; server_seed_hash: string; client_seed: string; nonce: number; created_at: number;
}

export interface PublicBet {
  id: number; username: string; game: GameId; amount: number; payout: number; multiplier: number;
  outcome: Outcome; createdAt: number;
}

export function placeBet(userId: number, game: GameId, params: BetParams, amount: number) {
  if (!Number.isSafeInteger(amount) || amount < config.limits.minBet) throw new BetError('Bet is below the minimum');
  if (amount > config.limits.maxBet) throw new BetError('Bet is above the maximum');

  return tx(() => {
    const user = q.get<UserRow>('SELECT * FROM users WHERE id = ?', userId)!;
    if (user.banned) throw new BetError('Account suspended');
    if (user.balance < amount) throw new BetError('Insufficient balance');

    const seed = activeSeed(userId);
    const nonce = user.nonce;
    const outcome = rollSync(game, params, seed.seed, user.client_seed, nonce);
    const payout = payoutFor(outcome, amount, config.payouts);
    const multiplier = amount ? payout / amount : 0;

    const r = q.run(
      `INSERT INTO bets (user_id, game, amount, payout, multiplier, params, outcome, server_seed_hash, client_seed, nonce, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      userId, game, amount, payout, multiplier, JSON.stringify(params), JSON.stringify(outcome), seed.hash, user.client_seed, nonce, now(),
    );
    const betId = Number(r.lastInsertRowid);
    applyBalance(userId, -amount, 'bet', `bet:${betId}`);
    const balance = payout > 0 ? applyBalance(userId, payout, 'payout', `bet:${betId}`) : user.balance - amount;
    q.run('UPDATE users SET nonce = nonce + 1, wagered = wagered + ?, profit = profit + ? WHERE id = ?', amount, payout - amount, userId);

    const bet: PublicBet = { id: betId, username: user.username, game, amount, payout, multiplier, outcome, createdAt: now() };
    return { bet, balance, fair: { serverSeedHash: seed.hash, clientSeed: user.client_seed, nonce } };
  });
}

export function toPublic(row: BetRow & { username: string }): PublicBet {
  return {
    id: row.id, username: row.username, game: row.game, amount: row.amount, payout: row.payout,
    multiplier: row.multiplier, outcome: JSON.parse(row.outcome), createdAt: row.created_at,
  };
}

export function recentBets(limit = 20): PublicBet[] {
  return q
    .all<BetRow & { username: string }>('SELECT b.*, u.username FROM bets b JOIN users u ON u.id = b.user_id ORDER BY b.id DESC LIMIT ?', limit)
    .map(toPublic);
}

export function userBets(userId: number, limit = 50) {
  return q
    .all<BetRow & { username: string; seed: string | null }>(
      `SELECT b.*, u.username, s.seed AS seed FROM bets b JOIN users u ON u.id = b.user_id
       LEFT JOIN seeds s ON s.hash = b.server_seed_hash AND s.revealed_at IS NOT NULL
       WHERE b.user_id = ? ORDER BY b.id DESC LIMIT ?`,
      userId, limit,
    )
    .map((r) => ({
      ...toPublic(r),
      params: JSON.parse(r.params) as BetParams,
      serverSeedHash: r.server_seed_hash,
      serverSeed: r.seed, // only present once the seed was rotated (revealed)
      clientSeed: r.client_seed,
      nonce: r.nonce,
    }));
}
