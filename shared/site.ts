/** Brand + SEO metadata shared by the SSR server and the client router. Rename the brand here. */
export const SITE = {
  name: 'DropDuel',
  tagline: 'Provably fair DonutSMP dispenser duels & coinflips',
  description:
    'Bet your DonutSMP money on provably fair dispenser duels and coinflips. Link your DonutSMP account, deposit with /pay, and cash out instantly in-game.',
  themeColor: '#f59e0b',
  locale: 'en_US',
};

export interface RouteMeta {
  path: string;
  title: string;
  description: string;
  /** Excluded from sitemap and marked noindex. */
  noindex?: boolean;
  /** Sitemap hints. */
  priority?: number;
  changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly';
  breadcrumb?: string;
}

export const ROUTES: RouteMeta[] = [
  {
    path: '/',
    title: `${SITE.name} — DonutSMP Gambling, Provably Fair`,
    description: SITE.description,
    priority: 1,
    changefreq: 'daily',
  },
  {
    path: '/duel',
    title: `Dispenser Duel — DonutSMP Gambling Machine | ${SITE.name}`,
    description:
      'The DonutSMP dispenser gambling machine, online and impossible to rig. Two dispensers drop 1–9, higher (or lower) wins, ties refund. Every roll is provably fair.',
    priority: 0.9,
    changefreq: 'weekly',
    breadcrumb: 'Dispenser Duel',
  },
  {
    path: '/coinflip',
    title: `DonutSMP Coinflip — 50/50, Provably Fair | ${SITE.name}`,
    description:
      'Flip a coin for DonutSMP money. Pick heads or tails, win 1.96×. Instant in-game payouts and a verifiable seed on every flip.',
    priority: 0.9,
    changefreq: 'weekly',
    breadcrumb: 'Coinflip',
  },
  {
    path: '/fair',
    title: `Provably Fair Verifier | ${SITE.name}`,
    description:
      'How our HMAC-SHA256 provably fair system works, plus a browser-side verifier so you can check any DonutSMP bet yourself.',
    priority: 0.7,
    changefreq: 'monthly',
    breadcrumb: 'Provably Fair',
  },
  {
    path: '/faq',
    title: `FAQ — Deposits, Withdrawals & Account Linking | ${SITE.name}`,
    description:
      'How to link your DonutSMP account, deposit with /pay, withdraw back in-game, and how odds and house edge work.',
    priority: 0.6,
    changefreq: 'monthly',
    breadcrumb: 'FAQ',
  },
  {
    path: '/terms',
    title: `Terms & Responsible Play | ${SITE.name}`,
    description: `Rules for using ${SITE.name}: in-game currency only, no real money, age requirements and responsible play.`,
    priority: 0.3,
    changefreq: 'monthly',
    breadcrumb: 'Terms',
  },
  {
    path: '/wallet',
    title: `Wallet | ${SITE.name}`,
    description: 'Your balance, deposits and withdrawals.',
    noindex: true,
  },
  {
    path: '/admin',
    title: `Admin | ${SITE.name}`,
    description: 'Operator console.',
    noindex: true,
  },
];

export const NOT_FOUND: RouteMeta = {
  path: '*',
  title: `Page not found | ${SITE.name}`,
  description: 'This page does not exist.',
  noindex: true,
};

export function matchRoute(pathname: string): RouteMeta {
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return ROUTES.find((r) => r.path === clean) ?? NOT_FOUND;
}

export const FAQ: { q: string; a: string }[] = [
  {
    q: 'How do I link my DonutSMP account?',
    a: 'Click “Link DonutSMP”, type your in-game name, and we show you a one-time code. Join DonutSMP and send it to our bot with /msg — the code proves you own the account. No password or API key needed.',
  },
  {
    q: 'How do I deposit?',
    a: 'In-game, run /pay with our bot’s name and the amount. The money is credited to your site balance within seconds of the bot seeing the payment. Payments from accounts that are not linked yet are held and credited the moment you link.',
  },
  {
    q: 'How do withdrawals work?',
    a: 'Open your wallet, enter an amount and press Withdraw. The bot sends the money back to your DonutSMP account with /pay. Large withdrawals may be reviewed by staff first.',
  },
  {
    q: 'Can I see my in-game balance?',
    a: 'Yes. Once linked, your wallet shows both your site balance and your live DonutSMP balance read from the official DonutSMP API.',
  },
  {
    q: 'Is it rigged?',
    a: 'No — and you can prove it. Every bet is derived from a server seed (whose SHA-256 hash you see before betting), your own client seed and a nonce. Rotate your seed to reveal the old one and verify every past bet on the Provably Fair page.',
  },
  {
    q: 'What are the odds?',
    a: 'Dispenser Duel: each side wins 4 in 9 rolls (44.4%), ties (11.1%) refund your bet. Coinflip: 50/50. Payout multipliers are shown on each game.',
  },
  {
    q: 'Is this real money?',
    a: 'No. Only DonutSMP in-game currency is used. You cannot buy balance with real money, and we are not affiliated with DonutSMP, Mojang or Microsoft.',
  },
];
