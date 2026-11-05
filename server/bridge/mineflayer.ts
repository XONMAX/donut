import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import type { Bridge, BridgeStatus } from './types.ts';
import type { Config } from '../config.ts';
import { parseMoney } from '../../shared/money.ts';

export class PaymentUnconfirmed extends Error {}

/**
 * Real in-game bridge: a Minecraft account logged into DonutSMP via mineflayer.
 *
 * SECURITY: payment and whisper messages are only accepted when they arrive as
 * *system* messages and match an anchored regex. Player chat can't produce a
 * system message, so nobody can type "Steve paid you $1B" in chat to fake a deposit.
 * Large deposits are additionally held for review (DEPOSIT_REVIEW_AT).
 */
export class MineflayerBridge extends EventEmitter implements Bridge {
  readonly kind = 'mineflayer' as const;
  private bot: any = null;
  private online = false;
  private detail = 'Starting';
  private stopped = false;
  private backoff = 5_000;
  private queue: Promise<unknown> = Promise.resolve();
  private payRe: RegExp;
  private paidRe: RegExp;
  private whisperRe: RegExp;

  constructor(private cfg: Config) {
    super();
    this.payRe = new RegExp(cfg.mc.payRegex);
    this.paidRe = new RegExp(cfg.mc.paidRegex);
    this.whisperRe = new RegExp(cfg.mc.whisperRegex);
  }

  status(): BridgeStatus {
    return { kind: 'mineflayer', online: this.online, botUsername: this.cfg.botUsername, detail: this.detail };
  }

  private setStatus(online: boolean, detail: string) {
    this.online = online;
    this.detail = detail;
    this.emit('status', this.status());
  }

  async start() {
    let mineflayer: any;
    try {
      // Optional dependency, loaded lazily so the site runs without it.
      // @ts-ignore -- optional dependency without bundled types
      mineflayer = (await import('mineflayer')).default;
    } catch {
      this.setStatus(false, 'mineflayer is not installed (npm i mineflayer)');
      return;
    }
    this.connect(mineflayer);
  }

  private connect(mineflayer: any) {
    if (this.stopped) return;
    this.setStatus(false, `Connecting to ${this.cfg.mc.host}`);
    const bot = mineflayer.createBot({
      host: this.cfg.mc.host,
      port: this.cfg.mc.port,
      version: this.cfg.mc.version,
      auth: this.cfg.mc.auth,
      username: this.cfg.mc.auth === 'microsoft' ? this.cfg.mc.email || this.cfg.botUsername : this.cfg.botUsername,
      profilesFolder: this.cfg.mc.profilesFolder,
      hideErrors: true,
      onMsaCode: (data: { user_code: string; verification_uri: string }) =>
        this.setStatus(false, `Microsoft login required: open ${data.verification_uri} and enter ${data.user_code}`),
    });
    this.bot = bot;

    bot.once('spawn', () => {
      this.backoff = 5_000;
      this.setStatus(true, `Online as ${bot.username}`);
    });
    bot.on('messagestr', (message: string, position: string) => this.onMessage(message.trim(), position));
    bot.on('kicked', (reason: unknown) => this.setStatus(false, `Kicked: ${String(JSON.stringify(reason)).slice(0, 200)}`));
    bot.on('error', (err: Error) => this.setStatus(false, `Error: ${err.message}`));
    bot.on('end', () => {
      this.setStatus(false, `Disconnected, retrying in ${this.backoff / 1000}s`);
      if (!this.stopped) setTimeout(() => this.connect(mineflayer), this.backoff);
      this.backoff = Math.min(this.backoff * 2, 5 * 60_000);
    });
  }

  private onMessage(message: string, position: string) {
    if (position !== 'system') return;
    const pay = this.payRe.exec(message);
    if (pay) {
      const amount = parseMoney(pay[2]);
      if (amount && amount > 0) {
        this.emit('payment', { id: `mc-${randomUUID()}`, from: pay[1], amount, raw: message, at: Date.now() });
      }
      return;
    }
    const whisper = this.whisperRe.exec(message);
    if (whisper) this.emit('whisper', { from: whisper[1], message: whisper[2].trim(), at: Date.now() });
  }

  async stop() {
    this.stopped = true;
    this.bot?.quit();
  }

  /** Payments are serialized and spaced out to stay under chat rate limits. */
  pay(player: string, amountCents: number): Promise<void> {
    const job = this.queue.then(() => this.payNow(player, amountCents));
    this.queue = job.catch(() => {}).then(() => new Promise((r) => setTimeout(r, 1500)));
    return job;
  }

  private payNow(player: string, amountCents: number): Promise<void> {
    if (!this.online || !this.bot) return Promise.reject(new Error('Bridge offline'));
    const dollars = (amountCents / 100).toFixed(2).replace(/\.00$/, '');
    const cmd = this.cfg.mc.payCommand.replace('{player}', player).replace('{amount}', dollars);

    return new Promise<void>((resolve, reject) => {
      const onMsg = (message: string, position: string) => {
        if (position !== 'system') return;
        const m = this.paidRe.exec(message.trim());
        if (!m || m[1].toLowerCase() !== player.toLowerCase()) return;
        const shown = parseMoney(m[2]) ?? 0;
        // DonutSMP shows compact amounts ("$1.5K"), so allow rounding differences.
        if (Math.abs(shown - amountCents) <= Math.max(100, amountCents * 0.01)) {
          cleanup();
          resolve();
        }
      };
      const timer = setTimeout(() => {
        cleanup();
        // We don't know whether the money moved: never auto-retry or auto-refund this.
        reject(new PaymentUnconfirmed(`No confirmation for "${cmd}" within 15s`));
      }, 15_000);
      const cleanup = () => {
        clearTimeout(timer);
        this.bot?.off('messagestr', onMsg);
      };
      this.bot.on('messagestr', onMsg);
      this.bot.chat(cmd);
    });
  }
}
