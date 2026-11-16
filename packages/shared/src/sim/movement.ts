import { SIM_CONFIG } from '../config/index.js';
import { moveCircle } from './collision.js';
import type { CollisionMap } from './collision.js';
import type { MoveInput, MoveMode, PlayerSimState } from './types.js';
import { weaponForSlot } from './weapon.js';

/** Duração de um tick da simulação, em segundos. */
export const TICK_SECONDS = 1 / SIM_CONFIG.tickRate;

/** Duração de um tick da simulação, em ms. */
export const TICK_MS = 1000 / SIM_CONFIG.tickRate;

/** O input pede movimento em algum eixo. */
export function isMoving(input: MoveInput): boolean {
  return input.moveX !== 0 || input.moveY !== 0;
}

/**
 * Correndo de verdade: `run` com movimento. Quem corre não atira e mira para onde corre
 * (escopo, seção 4). Correr parado conta como andar.
 */
export function isRunning(input: MoveInput): boolean {
  return input.moveMode === 'run' && isMoving(input);
}

/** Modo de movimento que vale no tick: correr parado conta como andar. */
export function effectiveMoveMode(input: MoveInput): MoveMode {
  return input.moveMode === 'run' && !isMoving(input) ? 'walk' : input.moveMode;
}

/**
 * Avança um jogador por `dt` segundos. Sem inércia: a velocidade vem direto do input,
 * multiplicada pela mobilidade da arma ativa. Na diagonal, cada eixo é multiplicado por 1/√2
 * para manter a mesma velocidade. Correndo, a mira fica presa na direção do movimento.
 */
export function stepPlayer(
  map: CollisionMap,
  state: PlayerSimState,
  input: MoveInput,
  dt: number,
): PlayerSimState {
  const moveMode = effectiveMoveMode(input);
  const mobility = weaponForSlot(state.weapon.activeSlot).mobility;
  const speed = SIM_CONFIG.moveSpeedPxPerSec[moveMode] * mobility;
  const scale = input.moveX !== 0 && input.moveY !== 0 ? Math.SQRT1_2 : 1;
  const dx = input.moveX * speed * scale * dt;
  const dy = input.moveY * speed * scale * dt;

  const position =
    dx === 0 && dy === 0
      ? state
      : moveCircle(map, state.x, state.y, SIM_CONFIG.playerRadius, dx, dy);

  return {
    ...state,
    x: position.x,
    y: position.y,
    aimAngle: isRunning(input) ? Math.atan2(input.moveY, input.moveX) : input.aimAngle,
    moveMode,
  };
}
