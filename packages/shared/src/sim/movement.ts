import { SIM_CONFIG } from '../config/index.js';
import { moveCircle } from './collision.js';
import type { CollisionMap } from './collision.js';
import type { MoveInput, MoveMode, PlayerSimState, Vec2 } from './types.js';
import { weaponForSlot } from './weapon.js';

/** Duração de um tick da simulação, em segundos. */
export const TICK_SECONDS = 1 / SIM_CONFIG.tickRate;

/** Duração de um tick da simulação, em ms. */
export const TICK_MS = 1000 / SIM_CONFIG.tickRate;

/**
 * Mira para o norte (para cima no mapa, y decrescente). Com ela, o movimento relativo à mira
 * coincide com os eixos do mundo: `moveX` vai para leste e `moveY` para sul.
 */
export const AIM_NORTH = -Math.PI / 2;

/** O input pede movimento em algum eixo. */
export function isMoving(input: MoveInput): boolean {
  return input.moveX !== 0 || input.moveY !== 0;
}

/**
 * Direção do movimento no mundo, com comprimento 1 (ou 0 parado). O input é relativo à mira:
 * `moveY = -1` anda para onde o jogador mira (W), `moveY = 1` para trás (S), `moveX = 1` para a
 * direita da mira (D) e `moveX = -1` para a esquerda (A). Na diagonal, cada eixo vale 1/√2.
 */
export function moveDirection(input: MoveInput): Vec2 {
  if (!isMoving(input)) {
    return { x: 0, y: 0 };
  }
  const scale = input.moveX !== 0 && input.moveY !== 0 ? Math.SQRT1_2 : 1;
  const right = input.moveX * scale;
  const back = input.moveY * scale;
  // Gira os eixos do teclado pelo quanto a mira se afasta do norte. Mirando para o norte o giro
  // é exatamente 0 (AIM_NORTH + π/2 === 0), e o movimento fica igual ao dos eixos do mundo.
  const turn = input.aimAngle - AIM_NORTH;
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  return { x: right * cos - back * sin, y: right * sin + back * cos };
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
 * multiplicada pela mobilidade da arma ativa. O movimento é relativo à mira do input
 * (`moveDirection`) e tem a mesma velocidade na diagonal. Correndo, a mira fica presa na
 * direção do movimento.
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
  const direction = moveDirection(input);
  const dx = direction.x * speed * dt;
  const dy = direction.y * speed * dt;

  const position =
    dx === 0 && dy === 0
      ? state
      : moveCircle(map, state.x, state.y, SIM_CONFIG.playerRadius, dx, dy);

  return {
    ...state,
    x: position.x,
    y: position.y,
    aimAngle: isRunning(input) ? Math.atan2(direction.y, direction.x) : input.aimAngle,
    moveMode,
  };
}
