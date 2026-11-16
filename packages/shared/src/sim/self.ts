// Um tick de um jogador: movimento e depois arma, a partir da posição nova. É a mesma conta no
// servidor (dentro de stepWorld) e na previsão do cliente.

import { COMBAT_CONFIG } from '../config/index.js';
import type { CollisionMap } from './collision.js';
import { TICK_SECONDS, isMoving, isRunning, stepPlayer } from './movement.js';
import type { PlayerInput, PlayerSimState, ShotFired } from './types.js';
import { createWeaponState, stepWeapon } from './weapon.js';

export interface SelfStepOptions {
  /** Duração do tick, em segundos. Padrão: um tick da simulação. */
  readonly dt?: number;
  /**
   * Input repetido pelo servidor com a fila vazia: move e mira, mas não dispara, não recarrega
   * e não troca de arma.
   */
  readonly repeated?: boolean;
  /**
   * Desvio do disparo número `shotIndex`, de -1 a 1 (multiplicado pela dispersão). Sem ele, o
   * desvio é 0: é o caso do cliente, que não conhece a seed da partida.
   */
  readonly deviation?: ((shotIndex: number) => number) | null;
}

export interface SelfStepResult {
  readonly state: PlayerSimState;
  /** Disparo deste tick, a partir da posição nova. `null`: não disparou. */
  readonly shot: ShotFired | null;
}

/** Jogador vivo no início da partida, com vida cheia e a arma pronta. */
export function createPlayerState(init: {
  readonly playerId: string;
  readonly team: PlayerSimState['team'];
  readonly x: number;
  readonly y: number;
  readonly aimAngle?: number;
}): PlayerSimState {
  return {
    playerId: init.playerId,
    team: init.team,
    x: init.x,
    y: init.y,
    aimAngle: init.aimAngle ?? 0,
    moveMode: 'walk',
    health: COMBAT_CONFIG.maxHealth,
    alive: true,
    respawnAtTick: null,
    weapon: createWeaponState(),
  };
}

/**
 * Avança um jogador vivo um tick: `stepPlayer` e depois `stepWeapon`. Jogador morto não move,
 * não atira e não recarrega: o estado volta igual.
 */
export function stepSelf(
  map: CollisionMap,
  state: PlayerSimState,
  input: PlayerInput,
  options: SelfStepOptions = {},
): SelfStepResult {
  if (!state.alive) {
    return { state, shot: null };
  }
  const dt = options.dt ?? TICK_SECONDS;
  const moved = stepPlayer(map, state, input, dt);
  const { weapon, shot } = stepWeapon(moved.weapon, {
    input,
    repeated: options.repeated ?? false,
    running: isRunning(input),
    moving: isMoving(input),
    moveMode: moved.moveMode,
    dtMs: dt * 1000,
    deviation: options.deviation ?? null,
  });
  const next: PlayerSimState = { ...moved, weapon };
  if (shot === null) {
    return { state: next, shot: null };
  }
  return {
    state: next,
    shot: {
      shooterId: next.playerId,
      weaponId: shot.weaponId,
      origin: { x: next.x, y: next.y },
      angle: next.aimAngle + (shot.offsetDeg * Math.PI) / 180,
      shotIndex: shot.shotIndex,
    },
  };
}
