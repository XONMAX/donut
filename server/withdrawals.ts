import { q, tx, now } from './db.ts';
import { applyBalance } from './ledger.ts';
import { config } from './config.ts';
import { notifyUser } from './events.ts';
import { PaymentUnconfirmed } from './bridge/mineflayer.ts';
import type { Bridge } from './bridge/types.ts';

export type WithdrawalStatus = 'pending' | 'review' | 'processing' | 'completed' | 'failed' | 'rejected' | 'unconfirmed';
export interface WithdrawalRow {
  id: number; user_id: number; username: string; amount: number; status: WithdrawalStatus;
  error: string | null; attempts: number; created_at: number; updated_at: number;
}

export class WithdrawError extends Error {}

/** Debits immediately (so the money can't be bet twice), then queues the in-game /pay. */
export function requestWithdrawal(userId: number, username: string, amount: number): WithdrawalRow {
  if (amount < config.limits.minWithdraw) throw new WithdrawError(`Minimum withdrawal is ${config.limits.minWithdraw / 100}`);
  return tx(() => {
    const open = q.get<{ n: number }>("SELECT COUNT(*) AS n FROM withdrawals WHERE user_id = ? AND status IN ('pending','processing')", userId)!.n;
    if (open >= 3) throw new WithdrawError('You already have withdrawals in progress');
    const status: WithdrawalStatus = amount >= config.limits.withdrawReviewAt ? 'review' : 'pending';
    const r = q.run(
      'INSERT INTO withdrawals (user_id, username, amount, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      userId, username, amount, status, now(), now(),
    );
    const id = Number(r.lastInsertRowid);
    applyBalance(userId, -amount, 'withdrawal', `withdrawal:${id}`);
    return q.get<WithdrawalRow>('SELECT * FROM withdrawals WHERE id = ?', id)!;
  });
}

function setStatus(id: number, status: WithdrawalStatus, error: string | null = null) {
  q.run('UPDATE withdrawals SET status = ?, error = ?, updated_at = ? WHERE id = ?', status, error, now(), id);
  const w = q.get<WithdrawalRow>('SELECT * FROM withdrawals WHERE id = ?', id)!;
  notifyUser(w.user_id, 'withdrawal', w);
  return w;
}

/** Fails a withdrawal and gives the money back. */
export function refundWithdrawal(id: number, status: 'failed' | 'rejected', reason: string) {
  return tx(() => {
    const w = q.get<WithdrawalRow>('SELECT * FROM withdrawals WHERE id = ?', id);
    if (!w || !['pending', 'review', 'processing', 'unconfirmed'].includes(w.status)) throw new WithdrawError('Withdrawal cannot be refunded');
    applyBalance(w.user_id, w.amount, 'withdrawal_refund', `withdrawal:${id}`);
    return setStatus(id, status, reason);
  });
}

export function approveWithdrawal(id: number) {
  const r = q.run("UPDATE withdrawals SET status = 'pending', updated_at = ? WHERE id = ? AND status = 'review'", now(), id);
  if (!r.changes) throw new WithdrawError('Withdrawal is not awaiting review');
}

/** Admin confirms an unconfirmed payout really did arrive in-game. */
export function markCompleted(id: number) {
  const r = q.run("UPDATE withdrawals SET status = 'completed', error = NULL, updated_at = ? WHERE id = ? AND status = 'unconfirmed'", now(), id);
  if (!r.changes) throw new WithdrawError('Withdrawal is not unconfirmed');
}

/** Processes the queue one at a time. Safe to call repeatedly. */
export function startWithdrawalWorker(bridge: Bridge, intervalMs = 2000) {
  // A crash mid-payment leaves rows "processing": we can't know if money moved, so flag for a human.
  q.run("UPDATE withdrawals SET status = 'unconfirmed', error = 'Server restarted during payout' WHERE status = 'processing'");
  let busy = false;
  const tick = async () => {
    if (busy || !bridge.status().online) return;
    busy = true;
    try {
      let next: WithdrawalRow | undefined;
      while ((next = q.get<WithdrawalRow>("SELECT * FROM withdrawals WHERE status = 'pending' ORDER BY id LIMIT 1"))) {
        const w = next;
        q.run("UPDATE withdrawals SET status = 'processing', attempts = attempts + 1, updated_at = ? WHERE id = ?", now(), w.id);
        try {
          await bridge.pay(w.username, w.amount);
          setStatus(w.id, 'completed');
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (err instanceof PaymentUnconfirmed) setStatus(w.id, 'unconfirmed', msg);
          else if (w.attempts + 1 < 3 && /offline/i.test(msg)) setStatus(w.id, 'pending', msg);
          else refundWithdrawal(w.id, 'failed', msg);
          if (!bridge.status().online) break;
        }
      }
    } finally {
      busy = false;
    }
  };
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  return { tick, stop: () => clearInterval(timer) };
}
