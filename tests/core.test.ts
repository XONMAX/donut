import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMoney, formatMoney } from '../shared/money.ts';
import { rollShared, rollSync, sha256, rotateSeed, activeSeed } from '../server/fair.ts';
import { q } from '../server/db.ts';
import { findOrCreateUser, handleDeposit, handleWhisper, startLink, approveDeposit } from '../server/accounts.ts';
import { placeBet, BetError, userBets } from '../server/bets.ts';
import { requestWithdrawal, startWithdrawalWorker, WithdrawError } from '../server/withdrawals.ts';
import { MockBridge } from '../server/bridge/mock.ts';
import { config } from '../server/config.ts';

assert.equal(config.dbPath, ':memory:', 'run tests with DB_PATH=:memory: (npm test)');

const ledgerSum = (userId: number) => q.get<{ s: number }>('SELECT COALESCE(SUM(amount),0) AS s FROM transactions WHERE user_id = ?', userId)!.s;
const balance = (userId: number) => q.get<{ balance: number }>('SELECT balance FROM users WHERE id = ?', userId)!.balance;

test('parseMoney understands DonutSMP shorthand', () => {
  assert.equal(parseMoney('1'), 100);
  assert.equal(parseMoney('$1,250.5'), 125050);
  assert.equal(parseMoney('250k'), 25_000_000);
  assert.equal(parseMoney('1.5M'), 150_000_000);
  assert.equal(parseMoney('2b'), 200_000_000_000);
  assert.equal(parseMoney('abc'), null);
  assert.equal(parseMoney('-5'), null);
  assert.equal(parseMoney('1e9'), null);
});

test('formatMoney is compact', () => {
  assert.equal(formatMoney(100), '$1');
  assert.equal(formatMoney(150_000_000), '$1.5M');
  assert.equal(formatMoney(25_000_000), '$250K');
  assert.equal(formatMoney(-12_345_00), '-$12.3K');
  assert.equal(formatMoney(500, { sign: true }), '+$5');
});

test('sync and shared fair implementations agree', async () => {
  for (let n = 0; n < 200; n++) {
    const a = rollSync('duel', { mode: 'higher' }, 'server-seed', 'client', n);
    const b = await rollShared('duel', { mode: 'higher' }, 'server-seed', 'client', n);
    assert.deepEqual(a, b);
  }
});

test('duel distribution is uniform 1–9 with ~11.1% ties', () => {
  const counts = new Array(10).fill(0);
  let ties = 0;
  const N = 40_000;
  for (let n = 0; n < N; n++) {
    const o = rollSync('duel', { mode: 'higher' }, 'seed-x', 'c', n);
    if (o.game !== 'duel') throw new Error();
    counts[o.player]++;
    if (o.result === 'push') ties++;
  }
  for (let v = 1; v <= 9; v++) assert.ok(Math.abs(counts[v] / N - 1 / 9) < 0.01, `face ${v}: ${counts[v]}`);
  assert.ok(Math.abs(ties / N - 1 / 9) < 0.01);
});

test('link → deposit → bet → withdraw keeps the ledger balanced', async () => {
  // Payment arrives before the player links: held as unclaimed.
  assert.equal(handleDeposit({ id: 'p1', from: 'Alice_1', amount: 1_000_000, raw: '', at: Date.now() }).status, 'unclaimed');
  assert.equal(handleDeposit({ id: 'p1', from: 'Alice_1', amount: 1_000_000, raw: '', at: Date.now() }).status, 'duplicate');

  q.run("INSERT INTO sessions (token_hash, created_at, expires_at) VALUES ('sess', 0, 9999999999999)");
  const link = startLink('sess', 'Alice_1');
  // Wrong sender can't complete someone else's link.
  assert.equal(handleWhisper({ from: 'Mallory', message: link.code, at: Date.now() }), null);
  const ok = handleWhisper({ from: 'Alice_1', message: `here: ${link.code.toLowerCase()}`, at: Date.now() });
  assert.ok(ok);
  const user = ok.user;
  assert.equal(q.get<{ user_id: number }>("SELECT user_id FROM sessions WHERE token_hash = 'sess'")!.user_id, user.id);
  assert.equal(balance(user.id), 1_000_000, 'unclaimed deposit credited on link');

  // Code is single-use.
  assert.equal(handleWhisper({ from: 'Alice_1', message: link.code, at: Date.now() }), null);

  for (let i = 0; i < 50; i++) placeBet(user.id, i % 2 ? 'duel' : 'coinflip', i % 2 ? { mode: 'lower' } : { side: 'tails' }, 1000);
  assert.equal(balance(user.id), ledgerSum(user.id));
  assert.throws(() => placeBet(user.id, 'duel', { mode: 'higher' }, balance(user.id) + 1), BetError);

  const bets = userBets(user.id);
  assert.equal(bets.length, 50);
  assert.equal(bets[0].serverSeed, null, 'seed hidden before rotation');
  const { revealed } = rotateSeed(user.id);
  assert.equal(sha256(revealed.seed), revealed.hash);
  const after = userBets(user.id);
  assert.equal(after[0].serverSeed, revealed.seed, 'seed revealed after rotation');
  const replay = rollSync(after[0].game, after[0].params, revealed.seed, after[0].clientSeed, after[0].nonce);
  assert.deepEqual(replay, after[0].outcome, 'past bet replays identically');
  assert.notEqual(activeSeed(user.id).hash, revealed.hash);

  // Withdrawals debit immediately and pay via the bridge.
  const bridge = new MockBridge('Bank');
  const before = balance(user.id);
  requestWithdrawal(user.id, user.username, 100_000);
  assert.equal(balance(user.id), before - 100_000);
  const worker = startWithdrawalWorker(bridge, 1_000_000);
  await worker.tick();
  assert.equal(bridge.sent.length, 1);
  assert.deepEqual([bridge.sent[0].player, bridge.sent[0].amount], ['Alice_1', 100_000]);

  // A failed payout is refunded.
  bridge.failNextPay = true;
  requestWithdrawal(user.id, user.username, 100_000);
  await worker.tick();
  worker.stop();
  assert.equal(balance(user.id), before - 100_000);
  assert.equal(q.get<{ status: string }>('SELECT status FROM withdrawals ORDER BY id DESC LIMIT 1')!.status, 'failed');
  assert.throws(() => requestWithdrawal(user.id, user.username, balance(user.id) + 100_000), /Insufficient/);
  assert.throws(() => requestWithdrawal(user.id, user.username, 1), WithdrawError);

  assert.equal(balance(user.id), ledgerSum(user.id), 'balance always equals sum of ledger');
});

test('large deposits are held for review', () => {
  const u = findOrCreateUser('Whale');
  assert.equal(handleDeposit({ id: 'big', from: 'Whale', amount: config.limits.depositReviewAt, raw: '', at: 0 }).status, 'review');
  assert.equal(balance(u.id), 0);
  const id = q.get<{ id: number }>("SELECT id FROM deposits WHERE event_id = 'big'")!.id;
  assert.equal(approveDeposit(id), 'credited');
  assert.equal(balance(u.id), config.limits.depositReviewAt);
});

test('concurrent bets cannot overdraw', async () => {
  const u = findOrCreateUser('Racer');
  handleDeposit({ id: 'r1', from: 'Racer', amount: 1000, raw: '', at: 0 });
  const results = await Promise.allSettled(Array.from({ length: 10 }, () => Promise.resolve().then(() => placeBet(u.id, 'coinflip', { side: 'heads' }, 1000))));
  assert.ok(balance(u.id) >= 0);
  assert.equal(balance(u.id), ledgerSum(u.id));
  assert.ok(results.some((r) => r.status === 'rejected') || balance(u.id) > 0);
});
