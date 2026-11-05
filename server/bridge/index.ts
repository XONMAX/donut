import { config } from '../config.ts';
import { MockBridge } from './mock.ts';
import { MineflayerBridge } from './mineflayer.ts';
import type { Bridge } from './types.ts';

export const bridge: Bridge =
  config.bridge === 'mineflayer' ? new MineflayerBridge(config) : new MockBridge(config.botUsername);

export { MockBridge, MineflayerBridge };
export type { Bridge };
