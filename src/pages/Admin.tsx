import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { api, ApiError } from '../api.ts';
import { useApp } from '../store.tsx';
import { Money, Stat, timeAgo } from '../components/ui.tsx';

interface Row { id: number; username: string; amount: number; status: string; error?: string | null; created_at: number }
interface Overview {
  bridge: { kind: string; online: boolean; botUsername: string; detail?: string };
  totals: Record<string, number | null>;
  depositReviews: Row[];
  withdrawalQueue: Row[];
  recentDeposits: Row[];
  recentWithdrawals: Row[];
  users: { id: number; username: string; balance: number; wagered: number; profit: number; banned: number }[];
}

const TOKEN_KEY = 'dd-admin-token';

export default function Admin() {
  const { toast } = useApp();
  const [token, setToken] = useState(() => {
    try { return sessionStorage.getItem(TOKEN_KEY) ?? ''; } catch { return ''; }
  });
  const [data, setData] = useState<Overview | null>(null);
  const [sim, setSim] = useState({ from: '', amount: '100k', message: '' });

  const call = useCallback(
    <T,>(path: string, body?: unknown) => api<T>(`/admin${path}`, { body, headers: { 'X-Admin-Token': token } }),
    [token],
  );
  const load = useCallback(async () => {
    try {
      setData(await call<Overview>('/overview'));
    } catch (e) {
      setData(null);
      if (token) toast(e instanceof ApiError ? e.message : 'Failed', 'err');
    }
  }, [call, token, toast]);

  useEffect(() => {
    if (!token) return;
    void load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [token, load]);

  const act = async (path: string) => {
    try {
      await call(path, {});
      toast('Done', 'ok');
      void load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Failed', 'err');
    }
  };

  if (!data) {
    return (
      <form
        className="card mx-auto max-w-sm space-y-4 p-6"
        onSubmit={(e: FormEvent<HTMLFormElement>) => {
          e.preventDefault();
          const t = String(new FormData(e.currentTarget).get('token') ?? '');
          try { sessionStorage.setItem(TOKEN_KEY, t); } catch { /* ignore */ }
          setToken(t);
        }}
      >
        <h1 className="text-xl font-bold">Operator console</h1>
        <label htmlFor="admin-token" className="label">Admin token</label>
        <input id="admin-token" name="token" type="password" className="input" defaultValue={token} autoComplete="current-password" required />
        <button className="btn-primary w-full">Unlock</button>
        <p className="text-xs text-ink-3">Set <span className="kbd">ADMIN_TOKEN</span> in .env</p>
      </form>
    );
  }

  const t = data.totals;
  const table = (rows: Row[], actions?: (r: Row) => ReactNode) => (
    <table className="w-full text-sm">
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="border-t border-line/60 first:border-0">
            <td className="px-4 py-2">#{r.id}</td>
            <td className="px-2 py-2">{r.username}</td>
            <td className="px-2 py-2"><Money cents={r.amount} /></td>
            <td className="px-2 py-2 text-xs capitalize">{r.status}{r.error && <span className="ml-1 text-ink-3">({r.error})</span>}</td>
            <td className="px-2 py-2 text-xs text-ink-3">{timeAgo(r.created_at)}</td>
            <td className="px-4 py-2 text-right whitespace-nowrap">{actions?.(r)}</td>
          </tr>
        ))}
        {rows.length === 0 && <tr><td className="px-4 py-4 text-center text-ink-3">Empty</td></tr>}
      </tbody>
    </table>
  );
  const small = 'btn-ghost px-2 py-1 text-xs';

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-extrabold">Operator console</h1>
        <span className={`pill ${data.bridge.online ? 'text-win' : 'text-loss'}`}>{data.bridge.kind} · {data.bridge.botUsername} · {data.bridge.online ? 'online' : 'offline'}</span>
        <span className="text-xs text-ink-3">{data.bridge.detail}</span>
        <button className="btn-ghost ml-auto text-xs" onClick={() => { try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } setToken(''); setData(null); }}>Lock</button>
      </header>

      <section className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Users">{t.users}</Stat>
        <Stat label="Liabilities"><Money cents={t.liabilities ?? 0} /></Stat>
        <Stat label="Bot in-game">{t.houseInGame == null ? <span className="text-sm text-ink-3">n/a</span> : <Money cents={t.houseInGame} className={t.houseInGame < (t.liabilities ?? 0) ? 'text-loss' : 'text-win'} />}</Stat>
        <Stat label="Wagered"><Money cents={t.wagered ?? 0} /></Stat>
        <Stat label="House profit"><Money cents={t.houseProfit ?? 0} sign /></Stat>
        <Stat label="Unclaimed"><Money cents={t.unclaimed ?? 0} /></Stat>
      </section>

      {data.bridge.kind === 'mock' && (
        <section className="card p-5">
          <h2 className="font-bold">Simulate in-game events (mock bridge)</h2>
          <p className="mb-4 text-sm text-ink-2">Pretend a player ran a command in DonutSMP.</p>
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto_auto]">
            <input className="input" placeholder="Player name" value={sim.from} onChange={(e) => setSim({ ...sim, from: e.target.value })} />
            <input className="input" placeholder="Amount (100k)" value={sim.amount} onChange={(e) => setSim({ ...sim, amount: e.target.value })} />
            <input className="input" placeholder="Whisper text (DD-XXXXXX)" value={sim.message} onChange={(e) => setSim({ ...sim, message: e.target.value })} />
            <button className="btn-primary" onClick={async () => { try { await call('/simulate/payment', { from: sim.from, amount: sim.amount }); toast(`${sim.from} paid ${sim.amount}`, 'ok'); void load(); } catch (e) { toast((e as Error).message, 'err'); } }}>/pay bot</button>
            <button className="btn-ghost" onClick={async () => { try { await call('/simulate/whisper', { from: sim.from, message: sim.message }); toast('Whisper sent', 'ok'); } catch (e) { toast((e as Error).message, 'err'); } }}>/msg bot</button>
          </div>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card overflow-x-auto">
          <h2 className="border-b border-line px-4 py-3 font-bold">Withdrawal queue</h2>
          {table(data.withdrawalQueue, (r) => (
            <>
              {r.status === 'review' && <button className={small} onClick={() => act(`/withdrawals/${r.id}/approve`)}>Approve</button>}{' '}
              {r.status === 'unconfirmed' && <button className={small} onClick={() => act(`/withdrawals/${r.id}/complete`)}>Arrived</button>}{' '}
              {['review', 'unconfirmed', 'pending'].includes(r.status) && <button className={`${small} text-loss`} onClick={() => act(`/withdrawals/${r.id}/reject`)}>Refund</button>}
            </>
          ))}
        </section>
        <section className="card overflow-x-auto">
          <h2 className="border-b border-line px-4 py-3 font-bold">Deposits awaiting review</h2>
          {table(data.depositReviews, (r) => (
            <>
              <button className={small} onClick={() => act(`/deposits/${r.id}/approve`)}>Credit</button>{' '}
              <button className={`${small} text-loss`} onClick={() => act(`/deposits/${r.id}/reject`)}>Reject</button>
            </>
          ))}
        </section>
        <section className="card overflow-x-auto">
          <h2 className="border-b border-line px-4 py-3 font-bold">Recent deposits</h2>
          {table(data.recentDeposits)}
        </section>
        <section className="card overflow-x-auto">
          <h2 className="border-b border-line px-4 py-3 font-bold">Recent withdrawals</h2>
          {table(data.recentWithdrawals)}
        </section>
      </div>

      <section className="card overflow-x-auto">
        <h2 className="border-b border-line px-4 py-3 font-bold">Top balances</h2>
        <table className="w-full text-sm">
          <tbody>
            {data.users.map((u) => (
              <tr key={u.id} className="border-t border-line/60 first:border-0">
                <td className="px-4 py-2">{u.username}{u.banned ? <span className="ml-2 text-xs text-loss">banned</span> : null}</td>
                <td className="px-2 py-2"><Money cents={u.balance} /></td>
                <td className="px-2 py-2 text-ink-2">wagered <Money cents={u.wagered} /></td>
                <td className="px-2 py-2"><Money cents={u.profit} sign /></td>
                <td className="px-4 py-2 text-right"><button className={small} onClick={() => act(`/users/${u.id}/ban`)}>{u.banned ? 'Unban' : 'Ban'}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
