import 'dotenv/config';
import { parseMoney } from '../shared/money.ts';

function str(name: string, fallback = ''): string {
  return process.env[name]?.trim() || fallback;
}
function num(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && process.env[name] !== '' && process.env[name] !== undefined ? v : fallback;
}
function money(name: string, fallback: string): number {
  return parseMoney(str(name, fallback)) ?? parseMoney(fallback)!;
}

const isProd = process.env.NODE_ENV === 'production';

/** Public URL the hosting platform gives us, used when SITE_URL isn't set. */
function platformUrl(): string {
  if (process.env.RENDER_EXTERNAL_URL) return process.env.RENDER_EXTERNAL_URL;
  if (process.env.RAILWAY_PUBLIC_DOMAIN) return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  if (process.env.FLY_APP_NAME) return `https://${process.env.FLY_APP_NAME}.fly.dev`;
  return `http://localhost:${num('PORT', 3000)}`;
}

export const config = {
  isProd,
  port: num('PORT', 3000),
  host: str('HOST', '0.0.0.0'),
  /** Public origin used for canonical URLs, sitemap and Origin (CSRF) checks. */
  siteUrl: str('SITE_URL', platformUrl()).replace(/\/+$/, ''),
  dbPath: str('DB_PATH', 'data/app.db'),
  /** Trust X-Forwarded-* when behind a reverse proxy (Cloud Run, nginx, Cloudflare). */
  trustProxy: str('TRUST_PROXY', isProd ? '1' : ''),
  adminToken: str('ADMIN_TOKEN'),

  donutApiKey: str('DONUTSMP_API_KEY'),
  donutApiBase: str('DONUTSMP_API_BASE', 'https://api.donutsmp.net'),

  /** "mock" (dev, simulate via admin console) or "mineflayer" (real in-game bot). */
  bridge: str('BRIDGE', 'mock') as 'mock' | 'mineflayer',
  botUsername: str('BOT_USERNAME', 'DropDuelBank'),
  mc: {
    host: str('MC_HOST', 'donutsmp.net'),
    port: num('MC_PORT', 25565),
    version: str('MC_VERSION') || undefined,
    auth: str('MC_AUTH', 'microsoft') as 'microsoft' | 'offline',
    email: str('MC_EMAIL'),
    profilesFolder: str('MC_PROFILES_DIR', 'data/mc-auth'),
    /** Regex for incoming payments, must capture (player) and (amount). Matched against SYSTEM messages only. */
    payRegex: str('MC_PAY_REGEX', '^(\\.?[A-Za-z0-9_]{3,16}) paid you \\$([0-9.,]+[KkMmBbTt]?)\\.?$'),
    /** Regex for an outgoing payment confirmation, must capture (amount) and (player). */
    paidRegex: str('MC_PAID_REGEX', '^You paid (\\.?[A-Za-z0-9_]{3,16}) \\$([0-9.,]+[KkMmBbTt]?)\\.?$'),
    /** Regex for private messages to the bot, must capture (player) and (message). */
    whisperRegex: str('MC_WHISPER_REGEX', '^\\[?(\\.?[A-Za-z0-9_]{3,16}) -> (?:me|you)\\]? ?:? (.+)$'),
    payCommand: str('MC_PAY_COMMAND', '/pay {player} {amount}'),
  },

  limits: {
    minBet: money('MIN_BET', '1'),
    maxBet: money('MAX_BET', '50m'),
    minDeposit: money('MIN_DEPOSIT', '1'),
    minWithdraw: money('MIN_WITHDRAW', '1k'),
    /** Withdrawals at or above this need admin approval. */
    withdrawReviewAt: money('WITHDRAW_REVIEW_AT', '100m'),
    /** Deposits at or above this are held for admin review (anti-spoof safety net). */
    depositReviewAt: money('DEPOSIT_REVIEW_AT', '500m'),
  },

  payouts: {
    duel: num('DUEL_MULTIPLIER', 1.95),
    coinflip: num('COINFLIP_MULTIPLIER', 1.96),
  },
};

export type Config = typeof config;
