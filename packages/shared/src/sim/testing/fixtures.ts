// Jogadores e inputs de teste. Só para testes; fica fora do build (tsconfig.build.json).

import { createPlayerState } from '../self.js';
import type { PlayerInput, PlayerSimState, TeamIndex } from '../types.js';

/** Jogador vivo, com vida cheia e a arma pronta, no time 0 se não for dito outro. */
export function testPlayer(
  playerId: string,
  x: number,
  y: number,
  overrides: Partial<PlayerSimState> & { readonly team?: TeamIndex } = {},
): PlayerSimState {
  return { ...createPlayerState({ playerId, team: overrides.team ?? 0, x, y }), ...overrides };
}

/** Input parado, mirando para o leste, sem atirar, com a primária. */
export function testInput(overrides: Partial<PlayerInput> = {}): PlayerInput {
  return {
    moveX: 0,
    moveY: 0,
    aimAngle: 0,
    moveMode: 'walk',
    fire: false,
    reload: false,
    weaponSlot: 'primary',
    ...overrides,
  };
}
