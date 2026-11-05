import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, ApiError, type MyBet } from '../api.ts';
import { useApp } from '../store.tsx';
import { CopyButton, Money, PlayerHead, Stat, timeAgo, Icon } from '../components/ui.tsx';
import { formatMoney, parseMoney } from '../../shared/money.ts';

interface WalletData {
  balance: number;
  deposits: { id: number; amount: number; status: string; createdAt: number }[];
  withdrawals: { id: number; amount: number; status: string; error: string | null; createdAt: number }[];
  transactions: { id: number; type: string; amount: number; balanceAfter: number; ref: string | null; createdAt: number }[];
}
interface DonutBalance { enabled: boolean; money?: number; error?: string; fetchedAt?: number }

const STATUS_STYLE: Record<string, string> = {
  completed: 'text-win', credited: 'text-win', pending: 'text-accent-2', processing: 'text-accent-2',
  review: 'text-push', unclaimed: 'text-push', unconfirmed: 'text-push', failed: 'text-loss', rejected: 'text-loss',
};

function StatusBadge({ s }: { s: string }) {
  return <span className={`text-xs font-semibold capitalize ${STATUS_STYLE[s] ?? 'text-ink-2'}`}>{s}</span>;
}

export default function Wallet() {
  const { user, ready, openLink, config, toast, setBalance, walletTick } = useApp();
  const [data, setData] = useState<WalletData | null>(null);
  const [donut, setDonut] = useState<DonutBalance | null>(null);
  const [bets, setBets] = useState<MyBet[]>([]);
  const [tab, setTab] = useState<'bets' | 'withdrawals' | 'deposits' | 'ledger'>('bets');
  const [depositAmt, setDepositAmt] = useState('100k');
  const [withdrawAmt, setWithdrawAmt] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [w, b] = await Promise.all([api<WalletData>('/wallet'), api<{ bets: MyBet[] }>('/bets/mine')]);
    setData(w);
    setBets(b.bets);
  }, []);
  const loadDonut = useCallback(async (refresh = false) => {
    setDonut(null);
    setDonut(await api<DonutBalance>(`/wallet/donut${refresh ? '?refresh=1' : ''}`).catch((e) => ({ enabled: true, error: e.message })));
  }, []);

  useEffect(() => {
    if (!user) return;
    void load();
    void loadDonut();
  }, [user?.id, load, loadDonut]); // eslint-disable-line react-hooks/exhaustive-deps

  // Refresh history on live wallet events (deposit, payout status, bets in another tab).
  useEffect(() => {
    if (user && walletTick) void load();
  }, [walletTick]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready) return <div className="card h-64 animate-pulse" />;
  if (!user) {
    return (
      <div className="card mx-auto max-w-lg p-8 text-center">
        <Icon.wallet className="mx-auto h-10 w-10 text-accent" />
        <h1 className="mt-3 text-2xl font-bold">Your wallet</h1>
        <p className="mt-2 text-ink-2">Link your DonutSMP account to deposit, play and withdraw.</p>
        <button className="btn-primary mt-6" onClick={() => openLink()}>Link DonutSMP</button>
      </div>
    );
  }

  const depositCents = parseMoney(depositAmt);
  const payCmd = `/pay ${config.botUsername} ${depositCents ? Math.floor(depositCents / 100) : '<amount>'}`;

  const withdraw = async (e: FormEvent) => {
    e.preventDefault();
    const cents = parseMoney(withdrawAmt);
    if (!cents) return toast('Enter an amount, e.g. 250k', 'err');
    setBusy(true);
    try {
      const r = await api<{ withdrawal: { status: string } }>('/wallet/withdraw', { body: { amount: (cents / 100).toFixed(2) } });
      toast(r.withdrawal.status === 'review' ? 'Withdrawal queued for staff review' : 'Withdrawal queued — the bot will /pay you shortly', 'ok');
      setWithdrawAmt('');
      setBalance(user.balance - cents);
      await load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Withdrawal failed', 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center gap-4">
        <PlayerHead name={user.username} size={48} />
        <div>
          <h1 className="text-2xl font-extrabold">Wallet</h1>
          <p className="text-sm text-ink-2">Linked to <b className="text-ink">{user.username}</b> on DonutSMP</p>
        </div>
        <span className={`pill ml-auto ${config.bridge.online ? 'text-win' : 'text-loss'}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${config.bridge.online ? 'bg-win' : 'bg-loss'}`} />
          Bank bot {config.bridge.online ? 'online' : 'offline'}
        </span>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Balances">
        <Stat label="Site balance"><Money cents={user.balance} className="text-accent-2" /></Stat>
        <Stat label="DonutSMP balance">
          {!donut ? (
            <span className="text-ink-3">…</span>
          ) : !donut.enabled ? (
            <span className="text-sm font-medium text-ink-3">API key not configured</span>
          ) : donut.error ? (
            <span className="text-sm font-medium text-loss">{donut.error}</span>
          ) : (
            <span className="flex items-center gap-2">
              <Money cents={donut.money ?? 0} />
              <button className="text-xs font-medium text-ink-3 hover:text-ink" onClick={() => loadDonut(true)} aria-label="Refresh in-game balance">↻</button>
            </span>
          )}
        </Stat>
        <Stat label="Wagered"><Money cents={user.wagered} /></Stat>
        <Stat label="Profit"><Money cents={user.profit} sign className={user.profit >= 0 ? 'text-win' : 'text-loss'} /></Stat>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-6" aria-labelledby="deposit-title">
          <h2 id="deposit-title" className="text-lg font-bold">Pay in (deposit)</h2>
          <p className="mt-1 text-sm text-ink-2">Send money from your DonutSMP account to our bank bot. It’s credited as soon as the bot sees it.</p>
          <label htmlFor="dep-amt" className="label mt-5">Amount</label>
          <input id="dep-amt" className="input num" value={depositAmt} onChange={(e) => setDepositAmt(e.target.value)} inputMode="decimal" />
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-accent/40 bg-accent/10 p-3">
            <code className="flex-1 truncate font-mono font-semibold text-accent-2">{payCmd}</code>
            <CopyButton text={payCmd} />
          </div>
          <ul className="mt-4 space-y-1 text-xs text-ink-3">
            <li>• Only pay from <b className="text-ink-2">{user.username}</b> — payments are matched by sender.</li>
            <li>• Minimum deposit {formatMoney(config.limits.minDeposit)}. Very large deposits may be checked by staff first.</li>
            <li>• Double-check the bot name: <span className="kbd">{config.botUsername}</span>. We can’t recover money sent to anyone else.</li>
          </ul>
        </section>

        <section className="card p-6" aria-labelledby="withdraw-title">
          <h2 id="withdraw-title" className="text-lg font-bold">Pay out (withdraw)</h2>
          <p className="mt-1 text-sm text-ink-2">The bot sends money straight back to <b className="text-ink">{user.username}</b> in-game with /pay.</p>
          <form onSubmit={withdraw} className="mt-5 space-y-3">
            <label htmlFor="wd-amt" className="label">Amount</label>
            <div className="flex gap-2">
              <input id="wd-amt" className="input num" placeholder={`min ${formatMoney(config.limits.minWithdraw)}`} value={withdrawAmt} onChange={(e) => setWithdrawAmt(e.target.value)} inputMode="decimal" />
              <button type="button" className="btn-ghost" onClick={() => setWithdrawAmt(String(Math.floor(user.balance / 100)))}>Max</button>
            </div>
            <button className="btn-primary w-full" disabled={busy || !withdrawAmt}>{busy ? 'Requesting…' : 'Withdraw to DonutSMP'}</button>
            {!config.bridge.online && <p className="text-xs text-loss">The bank bot is offline — withdrawals will queue and send once it reconnects.</p>}
          </form>
        </section>
      </div>

      <section className="card overflow-hidden" aria-label="History">
        <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-line p-2">
          {(['bets', 'withdrawals', 'deposits', 'ledger'] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} className={`rounded-lg px-3 py-1.5 text-sm font-medium capitalize ${tab === t ? 'bg-white/10 text-ink' : 'text-ink-3 hover:text-ink'}`} onClick={() => setTab(t)}>
              {t === 'bets' ? 'My bets' : t}
            </button>
          ))}
        </div>
        <div className="overflow-x-auto" role="tabpanel">
          <table className="w-full text-sm">
            <tbody>
              {tab === 'bets' && bets.map((b) => (
                <tr key={b.id} className="border-t border-line/60 first:border-0">
                  <td className="px-5 py-2.5 capitalize">{b.game}</td>
                  <td className="px-3 py-2.5 text-ink-2">{b.outcome.game === 'duel' ? `${b.outcome.player} vs ${b.outcome.house} · ${b.outcome.mode} wins` : `${b.outcome.flip} · called ${b.outcome.side}`}</td>
                  <td className="px-3 py-2.5 text-right"><Money cents={b.amount} /></td>
                  <td className={`px-3 py-2.5 text-right font-semibold ${b.payout > b.amount ? 'text-win' : b.payout < b.amount ? 'text-loss' : 'text-push'}`}><Money cents={b.payout - b.amount} sign /></td>
                  <td className="hidden px-3 py-2.5 font-mono text-xs text-ink-3 md:table-cell" title={b.serverSeedHash}>#{b.nonce} · {b.serverSeed ? 'revealed' : 'hidden'}</td>
                  <td className="px-5 py-2.5 text-right text-xs text-ink-3">{timeAgo(b.createdAt)}</td>
                </tr>
              ))}
              {tab === 'withdrawals' && data?.withdrawals.map((w) => (
                <tr key={w.id} className="border-t border-line/60 first:border-0">
                  <td className="px-5 py-2.5">#{w.id}</td>
                  <td className="px-3 py-2.5"><Money cents={w.amount} /></td>
                  <td className="px-3 py-2.5"><StatusBadge s={w.status} />{w.error && <span className="ml-2 text-xs text-ink-3">{w.error}</span>}</td>
                  <td className="px-5 py-2.5 text-right text-xs text-ink-3">{timeAgo(w.createdAt)}</td>
                </tr>
              ))}
              {tab === 'deposits' && data?.deposits.map((d) => (
                <tr key={d.id} className="border-t border-line/60 first:border-0">
                  <td className="px-5 py-2.5">#{d.id}</td>
                  <td className="px-3 py-2.5"><Money cents={d.amount} /></td>
                  <td className="px-3 py-2.5"><StatusBadge s={d.status} /></td>
                  <td className="px-5 py-2.5 text-right text-xs text-ink-3">{timeAgo(d.createdAt)}</td>
                </tr>
              ))}
              {tab === 'ledger' && data?.transactions.map((t) => (
                <tr key={t.id} className="border-t border-line/60 first:border-0">
                  <td className="px-5 py-2.5 capitalize">{t.type.replace('_', ' ')}</td>
                  <td className={`px-3 py-2.5 text-right font-semibold ${t.amount >= 0 ? 'text-win' : 'text-loss'}`}><Money cents={t.amount} sign /></td>
                  <td className="px-3 py-2.5 text-right text-ink-2"><Money cents={t.balanceAfter} /></td>
                  <td className="px-5 py-2.5 text-right text-xs text-ink-3">{timeAgo(t.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {((tab === 'bets' && bets.length === 0) || (tab !== 'bets' && data && (tab === 'ledger' ? data.transactions : data[tab]).length === 0)) && (
            <p className="px-5 py-8 text-center text-sm text-ink-3">Nothing here yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}
