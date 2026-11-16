import type { MoveAxis, MoveInput, MoveMode } from '@rainbow-pixel/shared';

/** Input do tick `tick` (0, 1, 2...). Sempre o mesmo para o mesmo tick. */
export type InputScript = (tick: number) => MoveInput;

/** As 8 direções do teclado, a partir do leste, no sentido horário (y cresce para baixo). */
export const DIRECTIONS: readonly (readonly [MoveAxis, MoveAxis])[] = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];

/** Anda na direção dada, mirando para onde anda. */
export function move(
  direction: readonly [MoveAxis, MoveAxis],
  moveMode: MoveMode = 'walk',
): MoveInput {
  const [moveX, moveY] = direction;
  return { moveX, moveY, aimAngle: Math.atan2(moveY, moveX), moveMode };
}
