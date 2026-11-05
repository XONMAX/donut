import { useState, type ReactNode } from 'react';
import { headUrl } from '../api.ts';
import { formatMoney, formatMoneyExact } from '../../shared/money.ts';

export function PlayerHead({ name, size = 24, className = '' }: { name: string; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span
        aria-hidden
        className={`inline-grid place-items-center rounded-md bg-surface-2 text-[10px] font-bold text-ink-2 ${className}`}
        style={{ width: size, height: size }}
      >
        {name.replace(/^\./, '').slice(0, 1).toUpperCase()}
      </span>
    );
  }
  return (
    <img
      src={headUrl(name, size * 2)}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={`px rounded-md ${className}`}
    />
  );
}

export function Money({ cents, className = '', sign = false }: { cents: number; className?: string; sign?: boolean }) {
  return (
    <span className={`num ${className}`} title={formatMoneyExact(cents)}>
      {formatMoney(cents, { sign })}
    </span>
  );
}

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn-ghost px-3 py-1.5 text-xs"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          /* clipboard blocked */
        }
      }}
    >
      {done ? 'Copied ✓' : label}
    </button>
  );
}

export function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-bg/50 p-4">
      <div className="text-xs font-semibold tracking-wide text-ink-3 uppercase">{label}</div>
      <div className="mt-1 text-xl font-bold">{children}</div>
    </div>
  );
}

export function timeAgo(t: number) {
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(t).toLocaleDateString();
}

export const Icon = {
  logo: (p: { className?: string }) => (
    <svg viewBox="0 0 32 32" aria-hidden className={p.className}>
      <rect x="2" y="2" width="28" height="28" rx="7" fill="#f59e0b" />
      <rect x="8" y="8" width="16" height="16" rx="4" fill="#1a1203" />
      <circle cx="13" cy="13" r="2" fill="#fbbf24" />
      <circle cx="19" cy="19" r="2" fill="#fbbf24" />
    </svg>
  ),
  wallet: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className={p.className}>
      <path d="M3 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1h1a1 1 0 0 1 1 1v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <circle cx="16.5" cy="13" r="1.2" fill="currentColor" />
    </svg>
  ),
  shield: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className={p.className}>
      <path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z" />
      <path d="m8.5 12 2.5 2.5 4.5-5" />
    </svg>
  ),
  bolt: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={p.className}>
      <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
    </svg>
  ),
  link: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className={p.className}>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </svg>
  ),
};
