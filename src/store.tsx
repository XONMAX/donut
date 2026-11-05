import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api, type PublicConfig, type User, type PublicBet } from './api.ts';

/** Server defaults used for SSR so the first client render matches the HTML. */
export const DEFAULT_CONFIG: PublicConfig = {
  botUsername: 'DropDuelBank',
  bridge: { kind: 'mock', online: true },
  donutApi: false,
  limits: { minBet: 100, maxBet: 5_000_000_000, minDeposit: 100, minWithdraw: 100_000, withdrawReviewAt: 0, depositReviewAt: 0 },
  payouts: { duel: 1.95, coinflip: 1.96 },
};

type Toast = { id: number; kind: 'ok' | 'err' | 'info'; text: string };

interface AppValue {
  config: PublicConfig;
  user: User | null;
  ready: boolean;
  feed: PublicBet[];
  /** Bumped on every wallet-affecting live event so views can refetch history. */
  walletTick: number;
  refreshMe: () => Promise<void>;
  setBalance: (b: number) => void;
  linkOpen: boolean;
  openLink: (open?: boolean) => void;
  toast: (text: string, kind?: Toast['kind']) => void;
  toasts: Toast[];
  logout: () => Promise<void>;
}

const Ctx = createContext<AppValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [feed, setFeed] = useState<PublicBet[]>([]);
  const [linkOpen, setLinkOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [walletTick, setWalletTick] = useState(0);
  const toastId = useRef(0);

  const toast = useCallback((text: string, kind: Toast['kind'] = 'info') => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-3), { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  const refreshMe = useCallback(async () => {
    const me = await api<{ user: User | null }>('/me').catch(() => ({ user: null }));
    setUser(me.user);
    setReady(true);
  }, []);

  useEffect(() => {
    void refreshMe();
    api<PublicConfig>('/config').then(setConfig).catch(() => {});
    api<{ bets: PublicBet[] }>('/bets/recent').then((r) => setFeed(r.bets)).catch(() => {});
  }, [refreshMe]);

  // Live updates. Re-opened when the user changes so the stream carries their identity.
  useEffect(() => {
    if (!ready) return;
    const es = new EventSource('/api/events');
    es.addEventListener('bet', (e) => {
      const bet = JSON.parse((e as MessageEvent).data) as PublicBet;
      setFeed((f) => [bet, ...f.filter((b) => b.id !== bet.id)].slice(0, 20));
    });
    es.addEventListener('balance', (e) => {
      const { balance } = JSON.parse((e as MessageEvent).data);
      setUser((u) => (u ? { ...u, balance } : u));
      setWalletTick((n) => n + 1);
    });
    es.addEventListener('deposit', (e) => {
      const { amount } = JSON.parse((e as MessageEvent).data);
      toast(`Deposit received: $${(amount / 100).toLocaleString()}`, 'ok');
    });
    es.addEventListener('withdrawal', (e) => {
      const w = JSON.parse((e as MessageEvent).data);
      setWalletTick((n) => n + 1);
      if (w.status === 'completed') toast(`Withdrawal sent in-game: $${(w.amount / 100).toLocaleString()}`, 'ok');
      if (w.status === 'failed' || w.status === 'rejected') toast(`Withdrawal ${w.status} — refunded to your balance`, 'err');
    });
    es.addEventListener('bridge', (e) => {
      const { online } = JSON.parse((e as MessageEvent).data);
      setConfig((c) => ({ ...c, bridge: { ...c.bridge, online } }));
    });
    return () => es.close();
  }, [ready, user?.id, toast]);

  const logout = useCallback(async () => {
    await api('/logout', { body: {} });
    setUser(null);
    toast('Signed out');
  }, [toast]);

  const value: AppValue = {
    config, user, ready, feed, walletTick, refreshMe, toast, toasts, logout, linkOpen,
    setBalance: (balance) => setUser((u) => (u ? { ...u, balance } : u)),
    openLink: (open = true) => setLinkOpen(open),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp outside AppProvider');
  return v;
}
