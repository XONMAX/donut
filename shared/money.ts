/**
 * All balances are stored as integer cents to avoid floating point drift.
 * DonutSMP displays money with K / M / B / T suffixes, so we accept those on input.
 */
const SUFFIX: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9, t: 1e12 };

/** Parses "1.5m", "$250k", "1,000" → cents. Returns null for invalid input. */
export function parseMoney(input: string | number): number | null {
  if (typeof input === 'number') {
    if (!Number.isFinite(input) || input < 0) return null;
    const c = Math.round(input * 100);
    return Number.isSafeInteger(c) ? c : null;
  }
  const s = input.trim().toLowerCase().replace(/[$,\s_]/g, '');
  const m = /^(\d+(?:\.\d+)?|\.\d+)([kmbt])?$/.exec(s);
  if (!m) return null;
  const value = Number(m[1]) * (m[2] ? SUFFIX[m[2]] : 1);
  if (!Number.isFinite(value)) return null;
  const cents = Math.round(value * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}

/** Compact DonutSMP-style format: 1234567 cents → "$12.35K". */
export function formatMoney(cents: number, opts: { compact?: boolean; sign?: boolean } = {}): string {
  const { compact = true, sign = false } = opts;
  const neg = cents < 0;
  const dollars = Math.abs(cents) / 100;
  let body: string;
  if (compact && dollars >= 1000) {
    const units: [number, string][] = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
    const [div, suf] = units.find(([d]) => dollars >= d)!;
    const v = dollars / div;
    const fixed = v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2);
    body = (fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed) + suf;
  } else {
    body = dollars.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }
  return `${neg ? '-' : sign && cents > 0 ? '+' : ''}$${body}`;
}

/** Full precision, e.g. "$1,234,567.89". */
export function formatMoneyExact(cents: number): string {
  return formatMoney(cents, { compact: false });
}
