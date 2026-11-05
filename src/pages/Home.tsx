import { Link } from '../router.tsx';
import { useApp } from '../store.tsx';
import { LiveFeed } from '../components/LiveFeed.tsx';
import { Icon } from '../components/ui.tsx';
import { FAQ, SITE } from '../../shared/site.ts';

const STEPS = [
  { t: 'Link your account', d: 'Type your DonutSMP name and /msg our bot a one-time code. No passwords.' },
  { t: 'Pay in with /pay', d: 'Send any amount to the bank bot in-game. It lands in your balance in seconds.' },
  { t: 'Play', d: 'Dispenser duels and coinflips, every roll provably fair.' },
  { t: 'Pay out', d: 'Withdraw any time — the bot /pays you straight back in-game.' },
];

export default function Home() {
  const { user, openLink, config } = useApp();
  return (
    <div className="space-y-16">
      <section className="grid items-center gap-10 pt-4 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <p className="pill mb-4"><Icon.shield className="h-3.5 w-3.5 text-win" /> Provably fair · Instant in-game payouts</p>
          <h1 className="text-4xl leading-[1.05] font-extrabold tracking-tight sm:text-5xl">
            DonutSMP gambling <span className="text-accent">you can actually verify.</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-ink-2">
            Bet your DonutSMP money on dispenser duels and coinflips. Deposit with <span className="kbd">/pay</span>, cash out
            in-game, and check every single roll yourself.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            {user ? (
              <Link href="/duel" className="btn-primary px-6 py-3 text-base">Play Dispenser Duel</Link>
            ) : (
              <button className="btn-primary px-6 py-3 text-base" onClick={() => openLink()}>
                <Icon.link className="h-4 w-4" /> Link DonutSMP account
              </button>
            )}
            <Link href="/fair" className="btn-ghost px-6 py-3 text-base">How fairness works</Link>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Link href="/duel" className="card group p-5 transition hover:-translate-y-0.5 hover:border-accent/40">
            <div className="dispenser mb-4 w-full" data-state="win"><div className="dispenser-face">7</div></div>
            <h2 className="font-bold">Dispenser Duel</h2>
            <p className="mt-1 text-sm text-ink-2">1–9 vs the house · {config.payouts.duel}×</p>
          </Link>
          <Link href="/coinflip" className="card group p-5 transition hover:-translate-y-0.5 hover:border-accent/40">
            <div className="mb-4 grid aspect-square w-full place-items-center">
              <div className="coin !w-full"><div className="coin-face">HEADS</div></div>
            </div>
            <h2 className="font-bold">Coinflip</h2>
            <p className="mt-1 text-sm text-ink-2">50/50 · {config.payouts.coinflip}×</p>
          </Link>
        </div>
      </section>

      <section aria-labelledby="how-title">
        <h2 id="how-title" className="mb-6 text-2xl font-bold">How {SITE.name} works</h2>
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.t} className="card p-5">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent/15 font-bold text-accent-2">{i + 1}</span>
              <h3 className="mt-3 font-semibold">{s.t}</h3>
              <p className="mt-1 text-sm text-ink-2">{s.d}</p>
            </li>
          ))}
        </ol>
      </section>

      <LiveFeed />

      <section aria-labelledby="faq-title" className="max-w-3xl">
        <h2 id="faq-title" className="mb-4 text-2xl font-bold">Common questions</h2>
        <div className="space-y-2">
          {FAQ.slice(0, 4).map((f) => (
            <details key={f.q} className="card group p-4">
              <summary className="cursor-pointer list-none font-semibold marker:hidden">
                <span className="mr-2 inline-block text-accent transition group-open:rotate-90">›</span>{f.q}
              </summary>
              <p className="mt-2 pl-5 text-sm text-ink-2">{f.a}</p>
            </details>
          ))}
        </div>
        <Link href="/faq" className="mt-4 inline-block text-sm font-semibold text-accent-2 hover:underline">All questions →</Link>
      </section>
    </div>
  );
}
