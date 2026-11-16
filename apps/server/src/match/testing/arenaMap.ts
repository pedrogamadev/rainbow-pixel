// Mapas pequenos para os testes da partida. Só para testes; fica fora do build.

import { MATERIAL_IDS, encodeBase64 } from '@rainbow-pixel/maps';
import type { MapDefinition, MapRect } from '@rainbow-pixel/maps';
import { SIM_CONFIG } from '@rainbow-pixel/shared';
import type { Vec2 } from '@rainbow-pixel/shared';

export interface ArenaOptions {
  /** Em células. */
  readonly width: number;
  readonly height: number;
  /** Células de wall_hard além da borda. */
  readonly walls?: (cx: number, cy: number) => boolean;
  /** Spawns do time 0. */
  readonly attack: readonly Vec2[];
  /** Zonas de spawn do time 1. */
  readonly defense: readonly MapRect[];
  readonly waypoints?: readonly Vec2[];
}

/** Arena cercada por wall_hard, sem waypoints se não forem dados. */
export function arenaMap(options: ArenaOptions): MapDefinition {
  const { width, height } = options;
  const cells = new Uint8Array(width * height);
  for (let cy = 0; cy < height; cy += 1) {
    for (let cx = 0; cx < width; cx += 1) {
      const border = cx === 0 || cy === 0 || cx === width - 1 || cy === height - 1;
      const wall = border || (options.walls?.(cx, cy) ?? false);
      cells[cy * width + cx] = wall ? MATERIAL_IDS.wall_hard : MATERIAL_IDS.floor;
    }
  }
  return {
    id: 'arena_test',
    name: 'Arena de teste',
    kind: 'gym',
    cellSize: SIM_CONFIG.cellSize,
    width,
    height,
    materials: [
      { id: MATERIAL_IDS.floor, name: 'floor' },
      { id: MATERIAL_IDS.wall_hard, name: 'wall_hard' },
    ],
    floors: [{ floorId: 0, cells: encodeBase64(cells) }],
    objects: {
      anchors: [],
      reinforceSlots: [],
      spawnAttack: options.attack.map((point, index) => ({
        id: `attack_${index}`,
        floorId: 0,
        ...point,
      })),
      spawnDefense: options.defense.map((rect, index) => ({
        id: `defense_${index}`,
        floorId: 0,
        rect,
      })),
      objectives: [],
      buildingInterior: [],
      cameras: [],
      noDeploy: [],
      botHints: (options.waypoints ?? []).map((point, index) => ({
        id: `waypoint_${index}`,
        floorId: 0,
        kind: 'waypoint' as const,
        ...point,
        order: index,
        targetId: null,
      })),
    },
  };
}

/** Zona de spawn de 40 x 40 px com o centro em `center` (um defensor nasce no centro). */
export function zoneAround(center: Vec2): MapRect {
  return { x: center.x - 20, y: center.y - 20, w: 40, h: 40 };
}
