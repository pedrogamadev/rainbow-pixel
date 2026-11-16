// Regras de validação de mapa (marco 0.2 e escopo, seções 7.2 e 7.3).
// Mapa inválido nunca chega ao servidor: o importador falha e o CI também (pnpm maps:check).

import {
  MapDataError,
  OBJECT_GROUP_LAYERS,
  createCollisionGrid,
  isWallMaterial,
} from '@rainbow-pixel/maps/format';
import type {
  CollisionGrid,
  MapAnchor,
  MapDefinition,
  MapObjectGroup,
  MapPoint,
  MapRect,
} from '@rainbow-pixel/maps/format';
import { SIM_CONFIG } from '@rainbow-pixel/shared';
import { MAP_LAYER, NO_OBJECT, issue } from './issues.js';
import type { ImportIssue } from './issues.js';

/** Regras e o identificador que aparece na mensagem de erro. */
export const RULES = {
  cellSize: 'cell_size',
  floorCells: 'floor_cells',
  uniqueIds: 'unique_ids',
  objectFloor: 'object_floor',
  insideMap: 'inside_map',
  spawnPerTeam: 'spawn_per_team',
  waypointWalkable: 'waypoint_walkable',
  attackSpawnCount: 'attack_spawn_count',
  objectivePair: 'objective_pair',
  anchorInWallGap: 'anchor_in_wall_gap',
  cameraInBuilding: 'camera_in_building',
} as const;

/** Mapa competitivo precisa de pelo menos 3 spawns de ataque (escopo, seção 3.3). */
const MIN_COMPETITIVE_ATTACK_SPAWNS = 3;

interface MapObjectRef {
  readonly group: MapObjectGroup;
  readonly id: string;
  readonly floorId: number;
  /** Pontos que precisam ficar dentro do mapa. */
  readonly points: readonly MapPoint[];
}

function rectCorners(rect: MapRect): MapPoint[] {
  return [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.w, y: rect.y + rect.h },
  ];
}

function allObjects(map: MapDefinition): MapObjectRef[] {
  const { objects } = map;
  const refs: MapObjectRef[] = [];
  const add = (group: MapObjectGroup, id: string, floorId: number, points: MapPoint[]) => {
    refs.push({ group, id, floorId, points });
  };
  for (const item of objects.anchors) add('anchors', item.id, item.floorId, rectCorners(item.rect));
  for (const item of objects.reinforceSlots)
    add('reinforceSlots', item.id, item.floorId, rectCorners(item.rect));
  for (const item of objects.spawnAttack) add('spawnAttack', item.id, item.floorId, [item]);
  for (const item of objects.spawnDefense)
    add('spawnDefense', item.id, item.floorId, rectCorners(item.rect));
  for (const item of objects.objectives)
    add('objectives', item.id, item.floorId, rectCorners(item.rect));
  for (const item of objects.buildingInterior)
    add('buildingInterior', item.id, item.floorId, item.polygon);
  for (const item of objects.cameras) add('cameras', item.id, item.floorId, [item]);
  for (const item of objects.noDeploy)
    add('noDeploy', item.id, item.floorId, rectCorners(item.rect));
  for (const item of objects.botHints) add('botHints', item.id, item.floorId, [item]);
  return refs;
}

/** Ponto dentro do polígono (regra par-ímpar). */
export function pointInPolygon(point: MapPoint, polygon: readonly MapPoint[]): boolean {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const a = polygon[index];
    const b = polygon[previous];
    if (a === undefined || b === undefined) continue;
    const crosses =
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

/** Células cobertas por um retângulo em px: [cx0, cx1) x [cy0, cy1). */
function coveredCells(rect: MapRect, cellSize: number) {
  return {
    cx0: Math.floor(rect.x / cellSize),
    cy0: Math.floor(rect.y / cellSize),
    cx1: Math.ceil((rect.x + rect.w) / cellSize),
    cy1: Math.ceil((rect.y + rect.h) / cellSize),
  };
}

/**
 * Porta ou janela fica sobre um vão de parede: as células da âncora são livres, e nas duas
 * pontas, ao longo da parede, há parede. Com facing N ou S a parede corre de leste a oeste;
 * com E ou W, de norte a sul.
 */
export function anchorSitsInWallGap(anchor: MapAnchor, grid: CollisionGrid): boolean {
  const { cx0, cy0, cx1, cy1 } = coveredCells(anchor.rect, grid.cellSize);
  for (let cy = cy0; cy < cy1; cy += 1) {
    for (let cx = cx0; cx < cx1; cx += 1) {
      if (grid.isSolid(cx, cy)) return false;
    }
  }
  const wallRunsEastWest = anchor.facing === 'N' || anchor.facing === 'S';
  if (wallRunsEastWest) {
    for (let cy = cy0; cy < cy1; cy += 1) {
      if (
        !isWallMaterial(grid.materialAt(cx0 - 1, cy)) ||
        !isWallMaterial(grid.materialAt(cx1, cy))
      ) {
        return false;
      }
    }
  } else {
    for (let cx = cx0; cx < cx1; cx += 1) {
      if (
        !isWallMaterial(grid.materialAt(cx, cy0 - 1)) ||
        !isWallMaterial(grid.materialAt(cx, cy1))
      ) {
        return false;
      }
    }
  }
  return true;
}

export function validateMap(map: MapDefinition): ImportIssue[] {
  const issues: ImportIssue[] = [];
  const report = (
    group: MapObjectGroup | null,
    objectId: string,
    rule: string,
    message: string,
  ) => {
    issues.push(
      issue(group === null ? MAP_LAYER : OBJECT_GROUP_LAYERS[group], objectId, rule, message),
    );
  };
  const { objects } = map;

  if (map.cellSize !== SIM_CONFIG.cellSize) {
    report(
      null,
      NO_OBJECT,
      RULES.cellSize,
      `o tile precisa ter ${SIM_CONFIG.cellSize} px (tem ${map.cellSize})`,
    );
  }

  const grids = new Map<number, CollisionGrid>();
  for (const floor of map.floors) {
    try {
      grids.set(floor.floorId, createCollisionGrid(map, floor.floorId));
    } catch (error) {
      if (!(error instanceof MapDataError)) throw error;
      report(null, NO_OBJECT, RULES.floorCells, error.message);
    }
  }

  const refs = allObjects(map);
  const seen = new Map<string, MapObjectRef>();
  const widthPx = map.width * map.cellSize;
  const heightPx = map.height * map.cellSize;
  for (const ref of refs) {
    const first = seen.get(ref.id);
    if (first !== undefined) {
      report(
        ref.group,
        ref.id,
        RULES.uniqueIds,
        `id repetido (já usado na camada ${OBJECT_GROUP_LAYERS[first.group]})`,
      );
    } else {
      seen.set(ref.id, ref);
    }
    if (!map.floors.some((floor) => floor.floorId === ref.floorId)) {
      report(ref.group, ref.id, RULES.objectFloor, `o andar ${ref.floorId} não existe no mapa`);
    }
    const outside = ref.points.some(
      (point) => point.x < 0 || point.y < 0 || point.x > widthPx || point.y > heightPx,
    );
    if (outside) {
      report(ref.group, ref.id, RULES.insideMap, `objeto fora do mapa (${widthPx}x${heightPx} px)`);
    }
  }

  if (objects.spawnAttack.length === 0) {
    report(
      'spawnAttack',
      NO_OBJECT,
      RULES.spawnPerTeam,
      'o mapa precisa de pelo menos 1 spawn_attack',
    );
  }
  if (objects.spawnDefense.length === 0) {
    report(
      'spawnDefense',
      NO_OBJECT,
      RULES.spawnPerTeam,
      'o mapa precisa de pelo menos 1 spawn_defense',
    );
  }

  for (const hint of objects.botHints) {
    if (hint.kind !== 'waypoint') continue;
    const grid = grids.get(hint.floorId);
    if (grid === undefined) continue;
    const cx = Math.floor(hint.x / map.cellSize);
    const cy = Math.floor(hint.y / map.cellSize);
    if (grid.isSolid(cx, cy)) {
      report(
        'botHints',
        hint.id,
        RULES.waypointWalkable,
        `waypoint em célula sólida (${grid.materialAt(cx, cy)})`,
      );
    }
  }

  if (map.kind === 'competitive') {
    validateCompetitive(map, grids, report);
  }
  return issues;
}

type Report = (
  group: MapObjectGroup | null,
  objectId: string,
  rule: string,
  message: string,
) => void;

/** Regras extras do mapa competitivo (escopo, seção 7.3). */
function validateCompetitive(
  map: MapDefinition,
  grids: ReadonlyMap<number, CollisionGrid>,
  report: Report,
): void {
  const { objects } = map;

  if (objects.spawnAttack.length < MIN_COMPETITIVE_ATTACK_SPAWNS) {
    report(
      'spawnAttack',
      NO_OBJECT,
      RULES.attackSpawnCount,
      `mapa competitivo precisa de pelo menos ${MIN_COMPETITIVE_ATTACK_SPAWNS} spawn_attack (tem ${objects.spawnAttack.length})`,
    );
  }

  if (objects.objectives.length === 0) {
    report(
      'objectives',
      NO_OBJECT,
      RULES.objectivePair,
      'mapa competitivo precisa de um par de alvos A e B',
    );
  }
  const pairs = new Map<string, typeof objects.objectives>();
  for (const objective of objects.objectives) {
    pairs.set(objective.pairId, [...(pairs.get(objective.pairId) ?? []), objective]);
  }
  for (const [pairId, members] of pairs) {
    const a = members.filter((member) => member.label === 'A');
    const b = members.filter((member) => member.label === 'B');
    if (a.length === 1 && b.length === 1) continue;
    for (const member of members) {
      report(
        'objectives',
        member.id,
        RULES.objectivePair,
        `o par "${pairId}" precisa de exatamente um alvo A e um alvo B (tem ${a.length} A e ${b.length} B)`,
      );
    }
  }

  for (const anchor of objects.anchors) {
    if (anchor.kind !== 'door' && anchor.kind !== 'window') continue;
    const grid = grids.get(anchor.floorId);
    if (grid !== undefined && !anchorSitsInWallGap(anchor, grid)) {
      report(
        'anchors',
        anchor.id,
        RULES.anchorInWallGap,
        'porta ou janela precisa ficar sobre um vão de parede, com parede nas duas pontas',
      );
    }
  }

  for (const camera of objects.cameras) {
    const inside = objects.buildingInterior.some(
      (zone) => zone.floorId === camera.floorId && pointInPolygon(camera, zone.polygon),
    );
    if (!inside) {
      report('cameras', camera.id, RULES.cameraInBuilding, 'câmera fora de building_interior');
    }
  }
}
