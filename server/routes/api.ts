import express, { type Request, type Response, type NextFunction } from 'express';
import { config } from '../config.ts';
import { q } from '../db.ts';
import { parseMoney } from '../../shared/money.ts';
import { validateParams, GAMES, type GameId } from '../../shared/fair.ts';
import { ensureSession, destroySession, requireUser, sameOrigin, rateLimit } from '../session.ts';
import { USERNAME_RE, startLink, currentLink } from '../accounts.ts';
import { placeBet, recentBets, userBets, BetError } from '../bets.ts';
import { activeSeed, rotateSeed } from '../fair.ts';
import { requestWithdrawal, WithdrawError, type WithdrawalRow } from '../withdrawals.ts';
import { getStats, donutApiEnabled, DonutApiError, invalidate } from '../donut-api.ts';
import { subscribe, broadcast } from '../events.ts';
import { bridge } from '../bridge/index.ts';
import { adminRouter } from './admin.ts';

export const api = express.Router();

api.use(express.json({ limit: '16kb' }));
api.use(sameOrigin);
api.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

/** Wraps async handlers so thrown errors reach the error middleware (Express 5 does this too). */
const h = (fn: (req: Request, res: Response) => unknown) => (req: Request, res: Response, next: NextFunction) =>
  Promise.resolve(fn(req, res)).catch(next);

const publicUser = (u: NonNullable<Request['user']>) => ({
  id: u.id,
  username: u.username,
  balance: u.balance,
  wagered: u.wagered,
  profit: u.profit,
  createdAt: u.created_at,
});

api.get('/config', (_req, res) => {
  const b = bridge.status();
  res.json({
    botUsername: config.botUsername,
    bridge: { kind: b.kind, online: b.online },
    donutApi: donutApiEnabled(),
    limits: config.limits,
    payouts: config.payouts,
  });
});

api.get('/me', (req, res) => {
  const link = req.sessionHash ? currentLink(req.sessionHash) : undefined;
  res.json({
    user: req.user ? publicUser(req.user) : null,
    link: link && link.status === 'pending' && link.expires_at > Date.now()
      ? { username: link.username, code: link.code, expiresAt: link.expires_at }
      : null,
  });
});

// ---- Account linking -------------------------------------------------------

api.post(
  '/link/start',
  rateLimit({ windowMs: 60_000, max: 6 }),
  h(async (req, res) => {
    const username = String(req.body?.username ?? '').trim();
    if (!USERNAME_RE.test(username)) return res.status(400).json({ error: 'Enter a valid Minecraft username (3–16 letters, numbers or _)' });

    let preview: { money: number } | null = null;
    if (donutApiEnabled()) {
      try {
        preview = { money: (await getStats(username)).money };
      } catch (e) {
        if (e instanceof DonutApiError && e.status === 404) {
          return res.status(404).json({ error: `“${username}” has never joined DonutSMP` });
        }
        // API down: allow linking anyway, the in-game whisper is the real proof.
      }
    }
    const link = startLink(ensureSession(req, res), username);
    res.json({ username: link.username, code: link.code, expiresAt: link.expires_at, botUsername: config.botUsername, preview });
  }),
);

api.get('/link/status', (req, res) => {
  if (req.user) return res.json({ status: 'verified', user: publicUser(req.user) });
  const link = req.sessionHash ? currentLink(req.sessionHash) : undefined;
  if (!link) return res.json({ status: 'none' });
  const expired = link.status === 'pending' && link.expires_at < Date.now();
  res.json({ status: expired ? 'expired' : link.status, code: link.code, username: link.username, expiresAt: link.expires_at });
});

api.post('/link/cancel', (req, res) => {
  if (req.sessionHash) q.run("UPDATE link_requests SET status = 'expired' WHERE session_hash = ? AND status = 'pending'", req.sessionHash);
  res.json({ ok: true });
});

api.post('/logout', (req, res) => {
  destroySession(req, res);
  res.json({ ok: true });
});

// ---- Wallet ----------------------------------------------------------------

api.get('/wallet', requireUser, (req, res) => {
  const u = req.user!;
  res.json({
    balance: u.balance,
    deposits: q.all('SELECT id, amount, status, created_at AS createdAt FROM deposits WHERE user_id = ? OR (username_lc = ? AND status IN (\'review\',\'unclaimed\')) ORDER BY id DESC LIMIT 25', u.id, u.username_lc),
    withdrawals: q.all('SELECT id, amount, status, error, created_at AS createdAt FROM withdrawals WHERE user_id = ? ORDER BY id DESC LIMIT 25', u.id),
    transactions: q.all('SELECT id, type, amount, balance_after AS balanceAfter, ref, created_at AS createdAt FROM transactions WHERE user_id = ? ORDER BY id DESC LIMIT 50', u.id),
  });
});

/** Live in-game balance from the official DonutSMP API. */
api.get(
  '/wallet/donut',
  requireUser,
  rateLimit({ windowMs: 60_000, max: 20 }),
  h(async (req, res) => {
    if (!donutApiEnabled()) return res.json({ enabled: false });
    if (req.query.refresh) invalidate(req.user!.username);
    try {
      const s = await getStats(req.user!.username);
      res.json({ enabled: true, money: s.money, shards: s.shards, fetchedAt: Date.now() });
    } catch (e) {
      res.status(e instanceof DonutApiError ? e.status : 502).json({ enabled: true, error: 'DonutSMP API unavailable' });
    }
  }),
);

api.post('/wallet/withdraw', requireUser, rateLimit({ windowMs: 60_000, max: 5 }), (req, res) => {
  const amount = parseMoney(String(req.body?.amount ?? ''));
  if (!amount) return res.status(400).json({ error: 'Enter an amount, e.g. 250k or 1.5m' });
  try {
    const w: WithdrawalRow = requestWithdrawal(req.user!.id, req.user!.username, amount);
    res.json({ withdrawal: { id: w.id, amount: w.amount, status: w.status, createdAt: w.created_at } });
  } catch (e) {
    if (e instanceof WithdrawError || (e instanceof Error && e.message === 'Insufficient balance')) {
      return res.status(400).json({ error: e.message });
    }
    throw e;
  }
});

// ---- Betting ---------------------------------------------------------------

api.post('/bets', requireUser, rateLimit({ windowMs: 10_000, max: 25 }), (req, res) => {
  const game = req.body?.game as GameId;
  if (!GAMES.includes(game)) return res.status(400).json({ error: 'Unknown game' });
  const params = validateParams(game, req.body?.params);
  if (!params) return res.status(400).json({ error: 'Invalid bet options' });
  const amount = parseMoney(String(req.body?.amount ?? ''));
  if (!amount) return res.status(400).json({ error: 'Enter a bet amount' });
  try {
    const result = placeBet(req.user!.id, game, params, amount);
    broadcast('bet', result.bet);
    res.json(result);
  } catch (e) {
    if (e instanceof BetError) return res.status(400).json({ error: e.message });
    throw e;
  }
});

api.get('/bets/recent', (_req, res) => res.json({ bets: recentBets(20) }));
api.get('/bets/mine', requireUser, (req, res) => res.json({ bets: userBets(req.user!.id, 50) }));

// ---- Provably fair ---------------------------------------------------------

api.get('/fair', requireUser, (req, res) => {
  const seed = activeSeed(req.user!.id);
  res.json({ serverSeedHash: seed.hash, clientSeed: req.user!.client_seed, nonce: req.user!.nonce });
});

api.post('/fair/rotate', requireUser, rateLimit({ windowMs: 60_000, max: 10 }), (req, res) => {
  const raw = req.body?.clientSeed;
  const clientSeed = raw === undefined || raw === '' ? undefined : String(raw).trim();
  if (clientSeed !== undefined && !/^[\x21-\x7e]{1,64}$/.test(clientSeed)) {
    return res.status(400).json({ error: 'Client seed must be 1–64 printable characters, no spaces' });
  }
  res.json(rotateSeed(req.user!.id, clientSeed));
});

// ---- Live updates ----------------------------------------------------------

api.get('/events', (req, res) => subscribe(res, req.user?.id ?? null));

api.use('/admin', adminRouter);

api.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// eslint-disable-next-line @typescript-eslint/no-unused-vars
api.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if ((err as { type?: string })?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
  console.error('[api]', err);
  res.status(500).json({ error: 'Something went wrong' });
});
