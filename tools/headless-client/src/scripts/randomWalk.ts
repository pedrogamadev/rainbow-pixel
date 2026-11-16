import { createSeededRandom } from '@rainbow-pixel/shared';
import type { MoveInput, MoveMode } from '@rainbow-pixel/shared';
import { idle } from './idle.js';
import { DIRECTIONS, move } from './types.js';
import type { InputScript } from './types.js';

const SEGMENT_MIN_TICKS = 10;
const SEGMENT_MAX_TICKS = 45;
const MODES: readonly MoveMode[] = ['walk', 'walk', 'slow', 'run'];

/**
 * Caminhada aleatória com semente fixa: trechos de 10 a 45 ticks, cada um numa direção (ou
 * parado) e num modo. Os trechos são gerados em ordem, então o tick N dá sempre o mesmo input.
 */
export function randomWalk(seed: number): InputScript {
  const random = createSeededRandom(seed);
  const segments: { readonly end: number; readonly input: MoveInput }[] = [];
  let end = 0;
  const extend = (tick: number) => {
    while (end <= tick) {
      end += SEGMENT_MIN_TICKS + Math.floor(random() * (SEGMENT_MAX_TICKS - SEGMENT_MIN_TICKS + 1));
      const direction = DIRECTIONS[Math.floor(random() * (DIRECTIONS.length + 1))];
      const moveMode = MODES[Math.floor(random() * MODES.length)] ?? 'walk';
      segments.push({
        end,
        input: direction === undefined ? { ...idle(0), moveMode } : move(direction, moveMode),
      });
    }
  };
  return (tick) => {
    extend(tick);
    return segments.find((segment) => tick < segment.end)?.input ?? idle(tick);
  };
}
