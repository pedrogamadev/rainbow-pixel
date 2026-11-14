import { SIM_CONFIG } from '../config/index.js';
import { moveCircle } from './collision.js';
import type { CollisionMap } from './collision.js';
import type { MoveInput, PlayerSimState } from './types.js';

/** Duração de um tick da simulação, em segundos. */
export const TICK_SECONDS = 1 / SIM_CONFIG.tickRate;

/** Duração de um tick da simulação, em ms. */
export const TICK_MS = 1000 / SIM_CONFIG.tickRate;

/**
 * Avança um jogador por `dt` segundos. Sem inércia: a velocidade vem direto do input.
 * Na diagonal, cada eixo é multiplicado por 1/√2 para manter a mesma velocidade.
 */
export function stepPlayer(
  map: CollisionMap,
  state: PlayerSimState,
  input: MoveInput,
  dt: number,
): PlayerSimState {
  const speed = SIM_CONFIG.moveSpeedPxPerSec[input.moveMode];
  const scale = input.moveX !== 0 && input.moveY !== 0 ? Math.SQRT1_2 : 1;
  const dx = input.moveX * speed * scale * dt;
  const dy = input.moveY * speed * scale * dt;

  const position =
    dx === 0 && dy === 0
      ? state
      : moveCircle(map, state.x, state.y, SIM_CONFIG.playerRadius, dx, dy);

  return {
    playerId: state.playerId,
    x: position.x,
    y: position.y,
    aimAngle: input.aimAngle,
    moveMode: input.moveMode,
  };
}
