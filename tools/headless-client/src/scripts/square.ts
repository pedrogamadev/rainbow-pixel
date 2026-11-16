import { DIRECTIONS, move } from './types.js';
import type { InputScript } from './types.js';

/** Ticks em cada lado: 1,5 s em linha reta. */
const TICKS_PER_SIDE = 45;
const SIDES = [DIRECTIONS[0], DIRECTIONS[2], DIRECTIONS[4], DIRECTIONS[6]] as const;

/** Anda em quadrado: direita, baixo, esquerda, cima, em linha reta. */
export const square: InputScript = (tick) => {
  const side = Math.floor(tick / TICKS_PER_SIDE) % SIDES.length;
  return move(SIDES[side] ?? [1, 0]);
};
