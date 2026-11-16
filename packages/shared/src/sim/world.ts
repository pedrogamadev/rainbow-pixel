import type { CollisionMap } from './collision.js';
import { stepPlayer } from './movement.js';
import type { MoveInput, PlayerSimState } from './types.js';

export interface SimWorld {
  readonly map: CollisionMap;
  /** Ticks já simulados. */
  readonly tick: number;
  readonly players: readonly PlayerSimState[];
}

export function createWorld(map: CollisionMap, players: readonly PlayerSimState[]): SimWorld {
  return { map, tick: 0, players };
}

/**
 * Avança o mundo um tick. Cada jogador usa o input do mapa; quem não tem input fica parado.
 * Jogadores não colidem entre si neste marco.
 */
export function stepWorld(
  world: SimWorld,
  inputsByPlayer: ReadonlyMap<string, MoveInput>,
  dt: number,
): SimWorld {
  return {
    map: world.map,
    tick: world.tick + 1,
    players: world.players.map((player) => {
      const input = inputsByPlayer.get(player.playerId);
      return input === undefined ? player : stepPlayer(world.map, player, input, dt);
    }),
  };
}
