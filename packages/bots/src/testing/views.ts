// Visões de teste para os cenários dos bots. Só para testes; fica fora do build.

import { SIM_CONFIG } from '@rainbow-pixel/shared';
import type { CollisionMap, Vec2 } from '@rainbow-pixel/shared';
import type { PlayerView, PlayerViewOther, PlayerViewSelf } from '../PlayerView.js';

/** Mapa aberto de 400 x 400 células (3200 px), só a borda é sólida. */
export const OPEN_MAP: CollisionMap = {
  cellSize: SIM_CONFIG.cellSize,
  width: 400,
  height: 400,
  isSolid: (cx, cy) => cx < 0 || cy < 0 || cx >= 400 || cy >= 400,
};

/** Mapa aberto com as células sólidas extras dadas. */
export function mapWith(isWall: (cx: number, cy: number) => boolean): CollisionMap {
  return { ...OPEN_MAP, isSolid: (cx, cy) => OPEN_MAP.isSolid(cx, cy) || isWall(cx, cy) };
}

export interface ViewOptions {
  readonly tick?: number;
  readonly self?: Partial<PlayerViewSelf>;
  readonly others?: readonly PlayerViewOther[];
  readonly waypoints?: readonly Vec2[];
  readonly map?: CollisionMap;
}

/** Bot do time 0 em (1000, 1000), mirando para o leste, vivo, com a primária cheia. */
export function botView(options: ViewOptions = {}): PlayerView {
  return {
    tick: options.tick ?? 0,
    self: {
      playerId: 'bot:1',
      team: 0,
      x: 1000,
      y: 1000,
      aimAngle: 0,
      health: 100,
      alive: true,
      activeSlot: 'primary',
      ammo: 30,
      reloading: false,
      ...options.self,
    },
    others: options.others ?? [],
    mapId: 'teste',
    map: options.map ?? OPEN_MAP,
    waypoints: options.waypoints ?? [],
  };
}

export function enemy(
  playerId: string,
  x: number,
  y: number,
  overrides: Partial<PlayerViewOther> = {},
): PlayerViewOther {
  return { playerId, team: 1, x, y, aimAngle: 0, alive: true, ...overrides };
}

export function ally(
  playerId: string,
  x: number,
  y: number,
  overrides: Partial<PlayerViewOther> = {},
): PlayerViewOther {
  return enemy(playerId, x, y, { team: 0, ...overrides });
}
