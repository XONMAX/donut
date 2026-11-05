import { Link } from '../router.tsx';
import { FAQ, SITE } from '../../shared/site.ts';

export function Faq() {
  return (
    <div className="max-w-3xl">
      <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Frequently asked questions</h1>
      <p className="mt-2 text-ink-2">Everything about linking, deposits, withdrawals and odds.</p>
      <div className="mt-8 space-y-3">
        {FAQ.map((f) => (
          <section key={f.q} className="card p-5">
            <h2 className="font-bold">{f.q}</h2>
            <p className="mt-2 text-ink-2">{f.a}</p>
          </section>
        ))}
      </div>
    </div>
  );
}

export function Terms() {
  return (
    <article className="prose-lite max-w-3xl">
      <h1 className="mb-4 text-3xl font-extrabold tracking-tight text-ink">Terms & responsible play</h1>
      <p>By using {SITE.name} you agree to the following.</p>
      <h2>In-game currency only</h2>
      <ul>
        <li>Balances are DonutSMP in-game money. They have no cash value and can’t be bought or sold here.</li>
        <li>Do not buy, sell or trade balances for real money. Accounts involved in real-money trading are closed.</li>
        <li>You must follow DonutSMP’s own rules. If gambling isn’t allowed where you play, don’t use this site.</li>
      </ul>
      <h2>Eligibility</h2>
      <ul>
        <li>You must be 18 or older, or the age of majority where you live, whichever is higher.</li>
        <li>One account per person. Linking accounts you don’t own is prohibited.</li>
      </ul>
      <h2>Deposits & withdrawals</h2>
      <ul>
        <li>Deposits are credited to the DonutSMP account that sent them.</li>
        <li>Withdrawals are only sent to your linked account. Large amounts can be reviewed before sending.</li>
        <li>We can suspend accounts for abuse, exploits or chargebacks of in-game trades.</li>
      </ul>
      <h2>Play responsibly</h2>
      <p>
        The house has an edge — over time you are expected to lose. Set a limit before you play, never chase losses,
        and take breaks. If gambling stops being fun, stop. Help is available at{' '}
        <a className="text-accent-2 underline" href="https://www.begambleaware.org/" rel="noopener noreferrer" target="_blank">BeGambleAware</a>.
      </p>
      <p>
        Not affiliated with DonutSMP, Mojang AB or Microsoft. <Link href="/faq" className="text-accent-2 underline">Read the FAQ</Link>.
      </p>
    </article>
  );
}

export function NotFound() {
  return (
    <div className="card mx-auto max-w-lg p-10 text-center">
      <div className="text-5xl font-black text-accent">404</div>
      <h1 className="mt-2 text-2xl font-bold">This page dispensed nothing</h1>
      <p className="mt-2 text-ink-2">The page you were looking for doesn’t exist.</p>
      <div className="mt-6 flex justify-center gap-3">
        <Link href="/" className="btn-primary">Home</Link>
        <Link href="/duel" className="btn-ghost">Play Duel</Link>
      </div>
    </div>
  );
}
