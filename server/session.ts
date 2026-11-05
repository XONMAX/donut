import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { q, now, type UserRow } from './db.ts';
import { config } from './config.ts';
import { sha256 } from './fair.ts';

const COOKIE = config.isProd ? '__Host-sid' : 'sid';
const TTL_MS = 30 * 24 * 60 * 60_000;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      sessionHash?: string;
      user?: UserRow;
    }
  }
}

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
}

function setCookie(res: Response, token: string) {
  const attrs = [`${COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${TTL_MS / 1000}`];
  if (config.isProd) attrs.push('Secure');
  res.append('Set-Cookie', attrs.join('; '));
}

/** Loads the session (if any). Tokens are stored hashed, so a DB leak doesn't leak sessions. */
export function loadSession(req: Request, _res: Response, next: NextFunction) {
  const token = readCookie(req, COOKIE);
  if (token && /^[a-f0-9]{64}$/.test(token)) {
    const hash = sha256(token);
    const s = q.get<{ user_id: number | null; expires_at: number }>('SELECT user_id, expires_at FROM sessions WHERE token_hash = ?', hash);
    if (s && s.expires_at > now()) {
      req.sessionHash = hash;
      if (s.user_id) req.user = q.get<UserRow>('SELECT * FROM users WHERE id = ?', s.user_id);
    }
  }
  next();
}

/** Ensures an (anonymous) session exists, creating one if needed. */
export function ensureSession(req: Request, res: Response): string {
  if (req.sessionHash) return req.sessionHash;
  const token = randomBytes(32).toString('hex');
  const hash = sha256(token);
  q.run('INSERT INTO sessions (token_hash, created_at, expires_at) VALUES (?, ?, ?)', hash, now(), now() + TTL_MS);
  setCookie(res, token);
  req.sessionHash = hash;
  return hash;
}

export function destroySession(req: Request, res: Response) {
  if (req.sessionHash) q.run('DELETE FROM sessions WHERE token_hash = ?', req.sessionHash);
  res.append('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${config.isProd ? '; Secure' : ''}`);
}

export function requireUser(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return void res.status(401).json({ error: 'Link your DonutSMP account first' });
  if (req.user.banned) return void res.status(403).json({ error: 'Account suspended' });
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const given = Buffer.from(String(req.headers['x-admin-token'] ?? ''));
  const expected = Buffer.from(config.adminToken);
  if (!config.adminToken || given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return void res.status(401).json({ error: 'Invalid admin token' });
  }
  next();
}

/**
 * CSRF defence for cookie-authenticated writes: SameSite=Lax already blocks most
 * cross-site POSTs; we also require a same-origin Origin header and a JSON body.
 */
export function sameOrigin(req: Request, res: Response, next: NextFunction) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  const origin = req.headers.origin;
  const host = `${req.protocol}://${req.get('host')}`;
  if (origin && origin !== host && origin !== config.siteUrl) {
    return void res.status(403).json({ error: 'Cross-origin request blocked' });
  }
  if (!req.is('application/json') && req.headers['content-length'] !== '0' && req.headers['content-length'] !== undefined) {
    return void res.status(415).json({ error: 'Expected application/json' });
  }
  next();
}

/** Tiny fixed-window rate limiter (single process). */
export function rateLimit(opts: { windowMs: number; max: number; key?: (req: Request) => string }) {
  const hits = new Map<string, { n: number; reset: number }>();
  setInterval(() => {
    const t = Date.now();
    for (const [k, v] of hits) if (v.reset < t) hits.delete(k);
  }, opts.windowMs).unref();
  return (req: Request, res: Response, next: NextFunction) => {
    const key = opts.key?.(req) ?? req.user?.id?.toString() ?? req.ip ?? 'anon';
    const t = Date.now();
    let h = hits.get(key);
    if (!h || h.reset < t) hits.set(key, (h = { n: 0, reset: t + opts.windowMs }));
    if (++h.n > opts.max) {
      res.setHeader('Retry-After', Math.ceil((h.reset - t) / 1000));
      return void res.status(429).json({ error: 'Too many requests, slow down' });
    }
    next();
  };
}
