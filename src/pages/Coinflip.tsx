import { useState } from 'react';
import { BetPanel, Segmented } from '../components/BetPanel.tsx';
import { LiveFeed } from '../components/LiveFeed.tsx';
import { Money } from '../components/ui.tsx';
import { Link } from '../router.tsx';
import { useApp } from '../store.tsx';
import { useBet } from './useBet.ts';
import type { CoinflipOutcome } from '../../shared/fair.ts';

export default function Coinflip() {
  const { config } = useApp();
  const [side, setSide] = useState<'heads' | 'tails'>('heads');
  const { busy, result, place } = useBet('coinflip', 1100);
  const [turns, setTurns] = useState(0);
  const o = result?.bet.outcome as CoinflipOutcome | undefined;
  const mult = config.payouts.coinflip;

  // Spin whole turns while waiting, then land on the result face.
  const rotation = turns * 1080 + (o?.flip === 'tails' ? 180 : 0);

  return (
    <div className="space-y-10">
      <header>
        <p className="pill mb-3">50 / 50 · {mult}× payout</p>
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">DonutSMP Coinflip</h1>
        <p className="mt-2 max-w-2xl text-ink-2">Call heads or tails. Win and your DonutSMP money is multiplied by {mult}× — instantly withdrawable in-game.</p>
      </header>

      <section className="grid gap-6 lg:grid-cols-[1fr_380px]" aria-label="Game">
        <div className="card grid place-items-center p-8 [perspective:900px]">
          <div className="coin" style={{ transform: `rotateY(${rotation}deg)` }} aria-hidden>
            <div className="coin-face">HEADS</div>
            <div className="coin-face tails">TAILS</div>
          </div>
          <div className="mt-8 min-h-14 text-center" aria-live="polite">
            {o && result && !busy ? (
              <div className="animate-in">
                <div className={`text-2xl font-extrabold ${o.result === 'win' ? 'text-win' : 'text-loss'}`}>
                  {o.flip === 'heads' ? 'Heads' : 'Tails'} — {o.result === 'win' ? 'you win!' : 'you lose'}
                </div>
                <div className="mt-1 text-sm text-ink-2">
                  {o.result === 'win' ? <>Paid <Money cents={result.bet.payout} className="font-semibold text-win" /></> : <>Lost <Money cents={result.bet.amount} /></>}
                </div>
              </div>
            ) : (
              <p className="text-sm text-ink-3">{busy ? 'Flipping…' : 'Pick a side and flip'}</p>
            )}
          </div>
        </div>
        <aside className="card p-6">
          <BetPanel
            busy={busy}
            cta="Flip the coin"
            onBet={(amount) => {
              setTurns((t) => t + 1);
              void place(amount, { side });
            }}
          >
            <Segmented label="Your call" value={side} onChange={setSide} options={[{ value: 'heads', label: 'Heads' }, { value: 'tails', label: 'Tails' }]} />
          </BetPanel>
        </aside>
      </section>

      <LiveFeed game="coinflip" />

      <section className="prose-lite max-w-3xl">
        <h2>Coinflip odds and payouts</h2>
        <p>
          Each flip is a single fair 50/50 outcome derived from HMAC-SHA256 of your server seed, client seed and nonce. Winning
          pays {mult}× your stake, a {(100 - mult * 50).toFixed(0)}% house edge — lower than most DonutSMP coinflip bots.
        </p>
        <p>
          Want to verify? Every flip in your history shows its nonce and seed hash. <Link className="text-accent-2 underline" href="/fair">Learn how verification works</Link>.
        </p>
      </section>
    </div>
  );
}
