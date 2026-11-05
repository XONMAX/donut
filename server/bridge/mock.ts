import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import type { Bridge, BridgeStatus } from './types.ts';

/** Development bridge. Payments "succeed" instantly; incoming events are simulated from /admin. */
export class MockBridge extends EventEmitter implements Bridge {
  readonly kind = 'mock' as const;
  readonly sent: { player: string; amount: number; at: number }[] = [];
  failNextPay = false;

  constructor(private botUsername: string) {
    super();
  }
  async start() {
    this.emit('status', this.status());
  }
  async stop() {}
  status(): BridgeStatus {
    return { kind: 'mock', online: true, botUsername: this.botUsername, detail: 'Simulated — use the admin console to fake in-game events.' };
  }
  async pay(player: string, amount: number) {
    await new Promise((r) => setTimeout(r, 150));
    if (this.failNextPay) {
      this.failNextPay = false;
      throw new Error('Simulated payment failure');
    }
    this.sent.push({ player, amount, at: Date.now() });
  }
  simulatePayment(from: string, amount: number) {
    this.emit('payment', { id: `mock-${randomUUID()}`, from, amount, raw: `${from} paid you`, at: Date.now() });
  }
  simulateWhisper(from: string, message: string) {
    this.emit('whisper', { from, message, at: Date.now() });
  }
}
