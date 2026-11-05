import { q, tx, now, type UserRow } from './db.ts';
import { notifyUser } from './events.ts';

export type TxType = 'deposit' | 'withdrawal' | 'withdrawal_refund' | 'bet' | 'payout' | 'adjust';

export class InsufficientFunds extends Error {
  constructor() {
    super('Insufficient balance');
  }
}

/**
 * The only function allowed to change a balance. Every change writes a
 * transactions row, so balance === SUM(transactions.amount) at all times.
 */
export function applyBalance(userId: number, amount: number, type: TxType, ref: string | null = null): number {
  if (!Number.isSafeInteger(amount)) throw new Error('amount must be an integer number of cents');
  return tx(() => {
    const user = q.get<Pick<UserRow, 'balance'>>('SELECT balance FROM users WHERE id = ?', userId);
    if (!user) throw new Error('user not found');
    const next = user.balance + amount;
    if (next < 0) throw new InsufficientFunds();
    q.run('UPDATE users SET balance = ? WHERE id = ?', next, userId);
    q.run(
      'INSERT INTO transactions (user_id, type, amount, balance_after, ref, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      userId, type, amount, next, ref, now(),
    );
    queueMicrotask(() => notifyUser(userId, 'balance', { balance: next }));
    return next;
  });
}

export function getBalance(userId: number): number {
  return q.get<{ balance: number }>('SELECT balance FROM users WHERE id = ?', userId)?.balance ?? 0;
}
