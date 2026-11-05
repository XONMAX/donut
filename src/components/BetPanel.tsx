import { useState, type ReactNode } from 'react';
import { useApp } from '../store.tsx';
import { formatMoney, parseMoney } from '../../shared/money.ts';

/** Bet amount input with DonutSMP-style shorthand (250k, 1.5m) and quick adjusters. */
export function BetPanel({
  onBet, busy, children, cta = 'Place bet',
}: {
  onBet: (amountCents: number) => void;
  busy: boolean;
  children?: ReactNode;
  cta?: string;
}) {
  const { user, openLink, config, ready } = useApp();
  const [raw, setRaw] = useState('10k');
  const cents = parseMoney(raw);
  const { minBet, maxBet } = config.limits;
  const balance = user?.balance ?? 0;

  const set = (c: number) => setRaw(String(Math.max(0, Math.floor(c / 100))));
  let problem = '';
  if (cents === null) problem = 'Enter an amount like 250k or 1.5m';
  else if (cents < minBet) problem = `Minimum bet is ${formatMoney(minBet)}`;
  else if (cents > maxBet) problem = `Maximum bet is ${formatMoney(maxBet)}`;
  else if (user && cents > balance) problem = 'Not enough balance — deposit with /pay';

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!user) return openLink();
        if (cents && !problem) onBet(cents);
      }}
    >
      <div>
        <div className="mb-1.5 flex items-end justify-between">
          <label htmlFor="bet-amount" className="label mb-0">Bet amount</label>
          {cents !== null && <span className="text-xs text-ink-3 num">{formatMoney(cents, { compact: false })}</span>}
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-3">$</span>
            <input
              id="bet-amount"
              className="input pl-7 font-semibold num"
              inputMode="decimal"
              autoComplete="off"
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              aria-invalid={Boolean(problem)}
              aria-describedby="bet-help"
            />
          </div>
          <button type="button" className="btn-ghost px-3" onClick={() => cents && set(cents / 2)}>½</button>
          <button type="button" className="btn-ghost px-3" onClick={() => cents && set(cents * 2)}>2×</button>
          <button type="button" className="btn-ghost px-3" disabled={!user} onClick={() => set(Math.min(balance, maxBet))}>Max</button>
        </div>
        <p id="bet-help" className={`mt-1.5 min-h-4 text-xs ${problem && user ? 'text-loss' : 'text-ink-3'}`}>
          {user && problem ? problem : `Shorthand works: 50k, 2.5m, 1b.`}
        </p>
      </div>
      {children}
      <button className="btn-primary w-full py-3 text-base" disabled={!ready || busy || (Boolean(user) && Boolean(problem))}>
        {!user ? 'Link DonutSMP to play' : busy ? 'Rolling…' : cta}
      </button>
    </form>
  );
}

export function Segmented<T extends string>({
  value, onChange, options, label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  label: string;
}) {
  return (
    <fieldset>
      <legend className="label">{label}</legend>
      <div className="grid grid-cols-2 gap-2 rounded-xl border border-line bg-bg/60 p-1">
        {options.map((o) => (
          <label
            key={o.value}
            className={`cursor-pointer rounded-lg px-3 py-2 text-center text-sm font-semibold transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent ${
              value === o.value ? 'bg-accent text-accent-ink' : 'text-ink-2 hover:bg-white/5'
            }`}
          >
            <input type="radio" className="sr-only" name={label} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
