import type { EventEmitter } from 'node:events';

/**
 * A bridge is whatever connects us to the DonutSMP server. In production that's a
 * Minecraft bot account (mineflayer) logged in as BOT_USERNAME; in development it's
 * a mock you drive from the admin console.
 *
 * Events:
 *   'payment'  (e: PaymentEvent)   someone ran /pay <bot> <amount>
 *   'whisper'  (e: WhisperEvent)   someone ran /msg <bot> <text>
 *   'status'   (s: BridgeStatus)
 */
export interface PaymentEvent { id: string; from: string; amount: number; raw: string; at: number }
export interface WhisperEvent { from: string; message: string; at: number }
export interface BridgeStatus { kind: 'mock' | 'mineflayer'; online: boolean; botUsername: string; detail?: string }

export interface Bridge extends EventEmitter {
  readonly kind: 'mock' | 'mineflayer';
  start(): Promise<void>;
  stop(): Promise<void>;
  status(): BridgeStatus;
  /** Sends in-game money. Resolves once the server confirms the payment, rejects otherwise. */
  pay(player: string, amountCents: number): Promise<void>;
}
