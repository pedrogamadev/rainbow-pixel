import { DIRECTIONS, move } from './types.js';
import type { MoveScript } from './types.js';

/** Ticks em cada direção: uma volta (octógono) a cada 64 ticks. */
const TICKS_PER_DIRECTION = 8;

/** Anda em círculo pelas 8 direções, com a mira girando junto. */
export const circle: MoveScript = (tick) => {
  const index = Math.floor(tick / TICKS_PER_DIRECTION) % DIRECTIONS.length;
  return move(DIRECTIONS[index] ?? [1, 0]);
};
