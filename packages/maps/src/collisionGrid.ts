import { decodeBase64 } from './base64.js';
import type { MapDefinition, MaterialName } from './schema.js';

/**
 * Materiais que bloqueiam o movimento (marco 0.2). Célula fora do mapa também bloqueia.
 * A barricada entra quando existir o gadget (marco 0.4).
 */
export const SOLID_MATERIALS: readonly MaterialName[] = ['wall_soft', 'wall_hard', 'void'];

export function isSolidMaterial(name: MaterialName): boolean {
  return SOLID_MATERIALS.includes(name);
}

/** Paredes, para as regras de âncora sobre vão de parede. */
export function isWallMaterial(name: MaterialName): boolean {
  return name === 'wall_soft' || name === 'wall_hard';
}

/** Grade de um andar: material de cada célula e se ela bloqueia o movimento. */
export interface CollisionGrid {
  readonly floorId: number;
  /** Lado da célula, em px. */
  readonly cellSize: number;
  /** Largura e altura, em células. */
  readonly width: number;
  readonly height: number;
  /** Fora do mapa é `void`. */
  materialAt(cx: number, cy: number): MaterialName;
  /** Fora do mapa é sólido. */
  isSolid(cx: number, cy: number): boolean;
}

export class MapDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MapDataError';
  }
}

/** Ids de material de cada célula do andar, linha a linha. */
export function decodeFloorCells(map: MapDefinition, floorId: number): Uint8Array {
  const floor = map.floors.find((item) => item.floorId === floorId);
  if (floor === undefined) {
    throw new MapDataError(`O mapa ${map.id} não tem o andar ${floorId}.`);
  }
  const cells = decodeBase64(floor.cells);
  if (cells.length !== map.width * map.height) {
    throw new MapDataError(
      `O andar ${floorId} do mapa ${map.id} tem ${cells.length} células; ` +
        `o esperado é ${map.width * map.height} (${map.width}x${map.height}).`,
    );
  }
  return cells;
}

export function createCollisionGrid(map: MapDefinition, floorId = 0): CollisionGrid {
  const cells = decodeFloorCells(map, floorId);
  const names: (MaterialName | undefined)[] = new Array<MaterialName | undefined>(256);
  for (const material of map.materials) {
    names[material.id] = material.name;
  }
  const solid = new Uint8Array(256).fill(1);
  names.forEach((name, id) => {
    if (name !== undefined && !isSolidMaterial(name)) {
      solid[id] = 0;
    }
  });
  const { width, height } = map;
  const inside = (cx: number, cy: number) =>
    Number.isInteger(cx) && Number.isInteger(cy) && cx >= 0 && cy >= 0 && cx < width && cy < height;

  return {
    floorId,
    cellSize: map.cellSize,
    width,
    height,
    materialAt(cx, cy) {
      if (!inside(cx, cy)) {
        return 'void';
      }
      return names[cells[cy * width + cx] ?? 0] ?? 'void';
    },
    isSolid(cx, cy) {
      if (!inside(cx, cy)) {
        return true;
      }
      return solid[cells[cy * width + cx] ?? 0] === 1;
    },
  };
}

/** Nome do material de cada id, para quem desenha o mapa. */
export function materialTable(map: MapDefinition): ReadonlyMap<number, MaterialName> {
  return new Map(map.materials.map((material) => [material.id, material.name]));
}
