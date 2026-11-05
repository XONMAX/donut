import { useCallback, useRef, useState } from 'react';
import { api, ApiError, type BetResult } from '../api.ts';
import { useApp } from '../store.tsx';
import type { BetParams, GameId } from '../../shared/fair.ts';

/** Places a bet and keeps the "rolling" state up for at least `minMs` so the animation reads. */
export function useBet(game: GameId, minMs = 750) {
  const { setBalance, toast } = useApp();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BetResult | null>(null);
  const inflight = useRef(false);

  const place = useCallback(
    async (amount: number, params: BetParams) => {
      if (inflight.current) return;
      inflight.current = true;
      setBusy(true);
      setResult(null);
      const started = performance.now();
      try {
        const r = await api<BetResult>('/bets', { body: { game, amount: (amount / 100).toFixed(2), params } });
        const wait = minMs - (performance.now() - started);
        if (wait > 0) await new Promise((res) => setTimeout(res, wait));
        setResult(r);
        setBalance(r.balance);
      } catch (e) {
        toast(e instanceof ApiError ? e.message : 'Bet failed', 'err');
      } finally {
        inflight.current = false;
        setBusy(false);
      }
    },
    [game, minMs, setBalance, toast],
  );

  return { busy, result, place };
}
