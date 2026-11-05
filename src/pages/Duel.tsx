import { useEffect, useRef, useState } from 'react';
import { BetPanel, Segmented } from '../components/BetPanel.tsx';
import { LiveFeed } from '../components/LiveFeed.tsx';
import { Money } from '../components/ui.tsx';
import { Link } from '../router.tsx';
import { useApp } from '../store.tsx';
import { useBet } from './useBet.ts';
import type { DuelOutcome } from '../../shared/fair.ts';

function Dispenser({ label, value, state }: { label: string; value: number | null; state: string }) {
  return (
    <figure className="flex flex-col items-center gap-3">
      <div className="dispenser w-full max-w-[220px]" data-state={state} aria-live="polite" aria-label={`${label}: ${value ?? 'not rolled'}`}>
        <div className="dispenser-face">{value ?? '?'}</div>
      </div>
      <figcaption className="text-sm font-semibold tracking-wide text-ink-2 uppercase">{label}</figcaption>
    </figure>
  );
}

export default function Duel() {
  const { config } = useApp();
  const [mode, setMode] = useState<'higher' | 'lower'>('higher');
  const { busy, result, place } = useBet('duel');
  const [spin, setSpin] = useState<[number, number]>([5, 5]);
  const formRef = useRef<HTMLDivElement>(null);
  const mult = config.payouts.duel;

  useEffect(() => {
    if (!busy) return;
    const id = setInterval(() => setSpin([1 + Math.floor(Math.random() * 9), 1 + Math.floor(Math.random() * 9)]), 70);
    return () => clearInterval(id);
  }, [busy]);

  // Space pulls the lever (unless typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return;
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, button, [contenteditable]')) return;
      e.preventDefault();
      formRef.current?.querySelector('form')?.requestSubmit();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  const o = result?.bet.outcome as DuelOutcome | undefined;
  const youState = busy ? 'rolling' : o ? o.result : 'idle';
  const houseState = busy ? 'rolling' : o ? (o.result === 'win' ? 'loss' : o.result === 'loss' ? 'win' : 'push') : 'idle';

  return (
    <div className="space-y-10">
      <header>
        <p className="pill mb-3">Provably fair · 1–9 dispensers</p>
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Dispenser Duel</h1>
        <p className="mt-2 max-w-2xl text-ink-2">
          The DonutSMP dispenser gambling machine, online — and impossible to rig. Two dispensers each drop a number from 1 to 9.
          Pick <b>higher wins</b> or <b>lower wins</b>; ties refund your bet.
        </p>
      </header>

      <section className="grid gap-6 lg:grid-cols-[1fr_380px]" aria-label="Game">
        <div className="card p-6 sm:p-8">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 sm:gap-8">
            <Dispenser label="You" value={busy ? spin[0] : o?.player ?? null} state={youState} />
            <span className="text-xl font-black text-ink-3">VS</span>
            <Dispenser label="House" value={busy ? spin[1] : o?.house ?? null} state={houseState} />
          </div>
          <div className="mt-8 min-h-14 text-center" aria-live="polite">
            {o && result && !busy ? (
              <div className="animate-in">
                <div className={`text-2xl font-extrabold ${o.result === 'win' ? 'text-win' : o.result === 'loss' ? 'text-loss' : 'text-push'}`}>
                  {o.result === 'win' ? 'You win!' : o.result === 'loss' ? 'House wins' : 'Tie — bet refunded'}
                </div>
                <div className="mt-1 text-sm text-ink-2">
                  {o.result === 'win' ? <>Paid <Money cents={result.bet.payout} className="font-semibold text-win" /></> : o.result === 'loss' ? <>Lost <Money cents={result.bet.amount} /></> : <>Returned <Money cents={result.bet.amount} /></>}
                  <span className="mx-2 text-ink-3">·</span>
                  <span className="text-ink-3">nonce {result.fair.nonce}</span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-ink-3">Pull the lever or press <span className="kbd">Space</span></p>
            )}
          </div>
        </div>

        <aside className="card p-6" ref={formRef}>
          <BetPanel busy={busy} cta="Pull the lever" onBet={(amount) => place(amount, { mode })}>
            <Segmented
              label="Winning rule"
              value={mode}
              onChange={setMode}
              options={[{ value: 'higher', label: 'Higher wins' }, { value: 'lower', label: 'Lower wins' }]}
            />
            <dl className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-lg bg-bg/60 p-2"><dt className="text-ink-3">Win</dt><dd className="font-bold text-win">44.4%</dd></div>
              <div className="rounded-lg bg-bg/60 p-2"><dt className="text-ink-3">Tie</dt><dd className="font-bold text-push">11.1%</dd></div>
              <div className="rounded-lg bg-bg/60 p-2"><dt className="text-ink-3">Payout</dt><dd className="font-bold text-accent-2">{mult}×</dd></div>
            </dl>
          </BetPanel>
        </aside>
      </section>

      <LiveFeed game="duel" />

      <section className="prose-lite max-w-3xl">
        <h2>How the dispenser gambling machine works</h2>
        <p>
          On DonutSMP, players build dispenser machines loaded with numbered paper: pull the lever, each dispenser drops a
          random number and the higher (or lower) side wins. The problem in-game is trust — whoever built the machine can rig it.
          Here, every roll comes from a cryptographic seed you can check after the fact.
        </p>
        <h3>Odds</h3>
        <ul>
          <li>Each dispenser drops 1–9, all nine numbers equally likely (81 combinations).</li>
          <li>You win in 36 of 81 combinations (44.4%), lose in 36 (44.4%), and tie in 9 (11.1%).</li>
          <li>Wins pay {mult}× your bet. Ties return your full bet. Return to player: {((36 / 81) * mult * 100 + (9 / 81) * 100).toFixed(1)}%.</li>
        </ul>
        <h3>Check any roll</h3>
        <p>
          Before you bet you see the SHA-256 hash of the server seed. Rotate your seed on the <Link className="text-accent-2 underline" href="/fair">Provably Fair</Link> page to reveal it and verify every past roll in your browser.
        </p>
      </section>
    </div>
  );
}
