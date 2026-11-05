import express from 'express';
import { q } from '../db.ts';
import { requireAdmin, rateLimit } from '../session.ts';
import { approveDeposit, rejectDeposit } from '../accounts.ts';
import { approveWithdrawal, refundWithdrawal, markCompleted } from '../withdrawals.ts';
import { bridge, MockBridge } from '../bridge/index.ts';
import { parseMoney } from '../../shared/money.ts';
import { getStats, donutApiEnabled } from '../donut-api.ts';
import { config } from '../config.ts';

export const adminRouter = express.Router();
adminRouter.use(rateLimit({ windowMs: 60_000, max: 120, key: (r) => `admin:${r.ip}` }));
adminRouter.use(requireAdmin);

adminRouter.get('/overview', async (_req, res) => {
  const sum = (sql: string) => q.get<{ v: number | null }>(sql)?.v ?? 0;
  let houseInGame: number | null = null;
  if (donutApiEnabled()) {
    houseInGame = await getStats(config.botUsername).then((s) => s.money).catch(() => null);
  }
  const liabilities = sum('SELECT SUM(balance) AS v FROM users');
  res.json({
    bridge: bridge.status(),
    totals: {
      users: sum('SELECT COUNT(*) AS v FROM users'),
      liabilities,
      deposited: sum("SELECT SUM(amount) AS v FROM deposits WHERE status = 'credited'"),
      withdrawn: sum("SELECT SUM(amount) AS v FROM withdrawals WHERE status = 'completed'"),
      wagered: sum('SELECT SUM(amount) AS v FROM bets'),
      houseProfit: sum('SELECT SUM(amount - payout) AS v FROM bets'),
      unclaimed: sum("SELECT SUM(amount) AS v FROM deposits WHERE status = 'unclaimed'"),
      houseInGame,
    },
    depositReviews: q.all("SELECT * FROM deposits WHERE status = 'review' ORDER BY id"),
    withdrawalQueue: q.all("SELECT * FROM withdrawals WHERE status IN ('review','unconfirmed','pending','processing') ORDER BY id"),
    recentDeposits: q.all('SELECT * FROM deposits ORDER BY id DESC LIMIT 15'),
    recentWithdrawals: q.all('SELECT * FROM withdrawals ORDER BY id DESC LIMIT 15'),
    users: q.all('SELECT id, username, balance, wagered, profit, banned, created_at FROM users ORDER BY balance DESC LIMIT 25'),
  });
});

const act = (fn: (id: number) => unknown) => (req: express.Request, res: express.Response) => {
  try {
    res.json({ ok: true, result: fn(Number(req.params.id)) ?? null });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
  }
};

adminRouter.post('/deposits/:id/approve', act(approveDeposit));
adminRouter.post('/deposits/:id/reject', act(rejectDeposit));
adminRouter.post('/withdrawals/:id/approve', act(approveWithdrawal));
adminRouter.post('/withdrawals/:id/reject', act((id) => refundWithdrawal(id, 'rejected', 'Rejected by staff')));
adminRouter.post('/withdrawals/:id/complete', act(markCompleted));
adminRouter.post('/users/:id/ban', act((id) => q.run('UPDATE users SET banned = 1 - banned WHERE id = ?', id)));

// ---- Mock bridge simulator (development only) ------------------------------

adminRouter.post('/simulate/:kind', (req, res) => {
  if (!(bridge instanceof MockBridge)) return res.status(400).json({ error: 'Simulation is only available with BRIDGE=mock' });
  const from = String(req.body?.from ?? '').trim();
  if (!from) return res.status(400).json({ error: 'from is required' });
  if (req.params.kind === 'payment') {
    const amount = parseMoney(String(req.body?.amount ?? ''));
    if (!amount) return res.status(400).json({ error: 'amount is required' });
    bridge.simulatePayment(from, amount);
  } else if (req.params.kind === 'whisper') {
    bridge.simulateWhisper(from, String(req.body?.message ?? ''));
  } else {
    return res.status(404).json({ error: 'Unknown simulation' });
  }
  res.json({ ok: true });
});
