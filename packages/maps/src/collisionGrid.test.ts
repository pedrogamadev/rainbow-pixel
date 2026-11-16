import { describe, expect, it } from 'vitest';
import { encodeBase64 } from './base64.js';
import { MapDataError, createCollisionGrid, isSolidMaterial } from './collisionGrid.js';
import { patrolWaypoints } from './index.js';
import { MATERIAL_IDS, MATERIAL_NAMES } from './schema.js';
import type { MapDefinition, MapBotHint } from './schema.js';

/** Mapa 4x3: linha de cima com cada material, o resto chão. */
function smallMap(overrides: Partial<MapDefinition> = {}): MapDefinition {
  const cells = Uint8Array.from([
    MATERIAL_IDS.floor,
    MATERIAL_IDS.wall_soft,
    MATERIAL_IDS.wall_hard,
    MATERIAL_IDS.void,
    ...new Array<number>(8).fill(MATERIAL_IDS.floor),
  ]);
  return {
    id: 'small',
    name: 'Pequeno',
    kind: 'gym',
    cellSize: 8,
    width: 4,
    height: 3,
    materials: MATERIAL_NAMES.map((name) => ({ id: MATERIAL_IDS[name], name })),
    floors: [{ floorId: 0, cells: encodeBase64(cells) }],
    objects: {
      anchors: [],
      reinforceSlots: [],
      spawnAttack: [],
      spawnDefense: [],
      objectives: [],
      buildingInterior: [],
      cameras: [],
      noDeploy: [],
      botHints: [],
    },
    ...overrides,
  };
}

describe('createCollisionGrid', () => {
  it('lê o material de cada célula', () => {
    const grid = createCollisionGrid(smallMap());
    expect([0, 1, 2, 3].map((cx) => grid.materialAt(cx, 0))).toEqual([
      'floor',
      'wall_soft',
      'wall_hard',
      'void',
    ]);
    expect(grid.materialAt(2, 2)).toBe('floor');
    expect(grid).toMatchObject({ floorId: 0, cellSize: 8, width: 4, height: 3 });
  });

  it('parede macia, parede reforçada e void são sólidas; chão não', () => {
    const grid = createCollisionGrid(smallMap());
    expect([0, 1, 2, 3].map((cx) => grid.isSolid(cx, 0))).toEqual([false, true, true, true]);
    expect(isSolidMaterial('floor')).toBe(false);
  });

  it('fora do mapa é sólido e void', () => {
    const grid = createCollisionGrid(smallMap());
    for (const [cx, cy] of [
      [-1, 0],
      [0, -1],
      [4, 0],
      [0, 3],
      [0.5, 1],
    ] as const) {
      expect(grid.isSolid(cx, cy)).toBe(true);
      expect(grid.materialAt(cx, cy)).toBe('void');
    }
  });

  it('recusa andar inexistente e quantidade errada de células', () => {
    expect(() => createCollisionGrid(smallMap(), 1)).toThrow(MapDataError);
    const broken = smallMap({ floors: [{ floorId: 0, cells: encodeBase64(new Uint8Array(5)) }] });
    expect(() => createCollisionGrid(broken)).toThrow(/5 células/);
  });
});

describe('patrolWaypoints', () => {
  function hint(id: string, order: number | null, x: number, floorId = 0): MapBotHint {
    return { id, floorId, kind: 'waypoint', x, y: 0, order, targetId: null };
  }

  it('devolve os waypoints do andar na ordem do circuito', () => {
    const map = smallMap();
    map.objects.botHints.push(
      hint('w_c', 3, 30),
      hint('w_a', 1, 10),
      { ...hint('cover_1', null, 99), kind: 'cover' },
      hint('w_sem_ordem', null, 40),
      hint('w_b', 2, 20),
      hint('w_outro_andar', 0, 50, 1),
    );
    expect(patrolWaypoints(map).map((point) => point.x)).toEqual([10, 20, 30, 40]);
  });
});
