/**
 * Provably fair outcome derivation, shared by the server (which rolls) and the
 * browser verifier (which checks). Only the HMAC primitive differs per runtime.
 *
 *   hmac   = HMAC_SHA256(key = serverSeed, message = `${clientSeed}:${nonce}:${round}`)
 *   floats = every 4 bytes of hmac → uint32 / 2^32   (8 floats per round)
 */
export type GameId = 'duel' | 'coinflip';
export const GAMES: GameId[] = ['duel', 'coinflip'];

export interface DuelParams { mode: 'higher' | 'lower' }
export interface CoinflipParams { side: 'heads' | 'tails' }
export type BetParams = DuelParams | CoinflipParams;

export interface DuelOutcome {
  game: 'duel';
  player: number;
  house: number;
  mode: 'higher' | 'lower';
  result: 'win' | 'loss' | 'push';
}
export interface CoinflipOutcome {
  game: 'coinflip';
  flip: 'heads' | 'tails';
  side: 'heads' | 'tails';
  result: 'win' | 'loss';
}
export type Outcome = DuelOutcome | CoinflipOutcome;

export type HmacFn = (key: string, message: string) => Promise<Uint8Array> | Uint8Array;

export function bytesToFloats(bytes: Uint8Array): number[] {
  const out: number[] = [];
  for (let i = 0; i + 4 <= bytes.length; i += 4) {
    const u = bytes[i] * 2 ** 24 + bytes[i + 1] * 2 ** 16 + bytes[i + 2] * 2 ** 8 + bytes[i + 3];
    out.push(u / 2 ** 32);
  }
  return out;
}

export async function fairFloats(hmac: HmacFn, serverSeed: string, clientSeed: string, nonce: number, count: number) {
  const floats: number[] = [];
  for (let round = 0; floats.length < count; round++) {
    floats.push(...bytesToFloats(await hmac(serverSeed, `${clientSeed}:${nonce}:${round}`)));
  }
  return floats.slice(0, count);
}

export const FLOATS_NEEDED: Record<GameId, number> = { duel: 2, coinflip: 1 };

export function resolveOutcome(game: GameId, params: BetParams, floats: number[]): Outcome {
  if (game === 'duel') {
    const { mode } = params as DuelParams;
    // Each dispenser drops a number 1–9, all equally likely.
    const player = Math.floor(floats[0] * 9) + 1;
    const house = Math.floor(floats[1] * 9) + 1;
    const result: DuelOutcome['result'] =
      player === house ? 'push' : (player > house) === (mode === 'higher') ? 'win' : 'loss';
    return { game, player, house, mode, result };
  }
  const { side } = params as CoinflipParams;
  const flip = floats[0] < 0.5 ? 'heads' : 'tails';
  return { game, flip, side, result: flip === side ? 'win' : 'loss' };
}

export function validateParams(game: unknown, params: unknown): BetParams | null {
  const p = (params ?? {}) as Record<string, unknown>;
  if (game === 'duel') return p.mode === 'higher' || p.mode === 'lower' ? { mode: p.mode } : null;
  if (game === 'coinflip') return p.side === 'heads' || p.side === 'tails' ? { side: p.side } : null;
  return null;
}

/** Payout in cents for a resolved outcome. Pushes refund the stake. */
export function payoutFor(outcome: Outcome, amount: number, multipliers: Record<GameId, number>): number {
  if (outcome.result === 'push') return amount;
  if (outcome.result === 'loss') return 0;
  return Math.floor(amount * multipliers[outcome.game]);
}
