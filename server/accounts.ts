import { randomBytes } from 'node:crypto';
import { q, tx, now, type UserRow } from './db.ts';
import { applyBalance } from './ledger.ts';
import { createActiveSeed, newClientSeed } from './fair.ts';
import { config } from './config.ts';
import { notifyUser } from './events.ts';
import type { PaymentEvent, WhisperEvent } from './bridge/types.ts';

/** Java names are 3–16 of [A-Za-z0-9_]; DonutSMP Bedrock players are prefixed with ".". */
export const USERNAME_RE = /^\.?[A-Za-z0-9_]{3,16}$/;
export const LINK_TTL_MS = 10 * 60_000;

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I confusion
export function newLinkCode(): string {
  const bytes = randomBytes(6);
  return 'DD-' + Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

export interface LinkRow {
  id: string; session_hash: string; username: string; username_lc: string;
  code: string; status: 'pending' | 'verified' | 'expired'; created_at: number; expires_at: number;
}

export function startLink(sessionHash: string, username: string): LinkRow {
  return tx(() => {
    q.run("UPDATE link_requests SET status = 'expired' WHERE session_hash = ? AND status = 'pending'", sessionHash);
    const row: LinkRow = {
      id: randomBytes(12).toString('hex'),
      session_hash: sessionHash,
      username,
      username_lc: username.toLowerCase(),
      code: newLinkCode(),
      status: 'pending',
      created_at: now(),
      expires_at: now() + LINK_TTL_MS,
    };
    q.run(
      'INSERT INTO link_requests (id, session_hash, username, username_lc, code, status, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      row.id, row.session_hash, row.username, row.username_lc, row.code, row.status, row.created_at, row.expires_at,
    );
    return row;
  });
}

export function currentLink(sessionHash: string): LinkRow | undefined {
  return q.get<LinkRow>('SELECT * FROM link_requests WHERE session_hash = ? ORDER BY created_at DESC LIMIT 1', sessionHash);
}

export function findOrCreateUser(username: string): UserRow {
  return tx(() => {
    const lc = username.toLowerCase();
    let user = q.get<UserRow>('SELECT * FROM users WHERE username_lc = ?', lc);
    if (!user) {
      q.run('INSERT INTO users (username, username_lc, client_seed, created_at) VALUES (?, ?, ?, ?)', username, lc, newClientSeed(), now());
      user = q.get<UserRow>('SELECT * FROM users WHERE username_lc = ?', lc)!;
      createActiveSeed(user.id);
    } else if (user.username !== username) {
      q.run('UPDATE users SET username = ? WHERE id = ?', username, user.id); // keep display casing fresh
    }
    claimUnclaimedDeposits(user.id, lc);
    return q.get<UserRow>('SELECT * FROM users WHERE id = ?', user.id)!;
  });
}

function claimUnclaimedDeposits(userId: number, usernameLc: string) {
  const rows = q.all<{ id: number; amount: number }>("SELECT id, amount FROM deposits WHERE username_lc = ? AND status = 'unclaimed'", usernameLc);
  for (const d of rows) {
    applyBalance(userId, d.amount, 'deposit', `deposit:${d.id}`);
    q.run("UPDATE deposits SET status = 'credited', user_id = ?, credited_at = ? WHERE id = ?", userId, now(), d.id);
  }
}

/**
 * A whisper containing a pending code from the *same* account completes the link.
 * The sender name comes from the server's whisper format, so it can't be spoofed.
 */
export function handleWhisper(e: WhisperEvent): { linked: LinkRow; user: UserRow } | null {
  const code = /DD-[A-Z0-9]{6}/i.exec(e.message)?.[0]?.toUpperCase();
  if (!code) return null;
  const link = q.get<LinkRow>("SELECT * FROM link_requests WHERE code = ? AND status = 'pending'", code);
  if (!link || link.expires_at < now() || link.username_lc !== e.from.toLowerCase()) return null;
  return tx(() => {
    q.run("UPDATE link_requests SET status = 'verified' WHERE id = ?", link.id);
    const user = findOrCreateUser(e.from);
    // Attach the browser session that started the link.
    q.run('UPDATE sessions SET user_id = ? WHERE token_hash = ?', user.id, link.session_hash);
    return { linked: { ...link, status: 'verified' as const }, user };
  });
}

/** An in-game /pay to the bot. Credits linked users, holds others until they link. */
export function handleDeposit(e: PaymentEvent): { status: string; userId: number | null } {
  if (!USERNAME_RE.test(e.from) || e.amount < config.limits.minDeposit) return { status: 'ignored', userId: null };
  return tx(() => {
    const lc = e.from.toLowerCase();
    const user = q.get<UserRow>('SELECT * FROM users WHERE username_lc = ?', lc);
    const status = e.amount >= config.limits.depositReviewAt ? 'review' : user ? 'credited' : 'unclaimed';
    const res = q.run(
      'INSERT OR IGNORE INTO deposits (event_id, username, username_lc, amount, status, user_id, created_at, credited_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      e.id, e.from, lc, e.amount, status, user?.id ?? null, now(), status === 'credited' ? now() : null,
    );
    if (res.changes === 0) return { status: 'duplicate', userId: user?.id ?? null };
    if (status === 'credited' && user) {
      applyBalance(user.id, e.amount, 'deposit', `deposit:${res.lastInsertRowid}`);
      queueMicrotask(() => notifyUser(user.id, 'deposit', { amount: e.amount }));
    }
    return { status, userId: user?.id ?? null };
  });
}

/** Admin approves a deposit that was held for review. */
export function approveDeposit(id: number) {
  return tx(() => {
    const d = q.get<{ id: number; username: string; username_lc: string; amount: number; status: string }>('SELECT * FROM deposits WHERE id = ?', id);
    if (!d || d.status !== 'review') throw new Error('Deposit is not awaiting review');
    const user = q.get<UserRow>('SELECT * FROM users WHERE username_lc = ?', d.username_lc);
    if (!user) {
      q.run("UPDATE deposits SET status = 'unclaimed' WHERE id = ?", id);
      return 'unclaimed';
    }
    applyBalance(user.id, d.amount, 'deposit', `deposit:${id}`);
    q.run("UPDATE deposits SET status = 'credited', user_id = ?, credited_at = ? WHERE id = ?", user.id, now(), id);
    return 'credited';
  });
}

export function rejectDeposit(id: number) {
  const r = q.run("UPDATE deposits SET status = 'rejected' WHERE id = ? AND status = 'review'", id);
  if (!r.changes) throw new Error('Deposit is not awaiting review');
}
