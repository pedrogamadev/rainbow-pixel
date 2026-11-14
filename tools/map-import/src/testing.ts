// Mapas mínimos para os testes do importador.

import { MATERIAL_IDS, MATERIAL_NAMES, encodeBase64 } from '@rainbow-pixel/maps/format';
import type { MapDefinition, MaterialName } from '@rainbow-pixel/maps/format';

/**
 * Mapa 20x20 desenhado em texto: `#` wall_hard, `s` wall_soft, `.` chão, ` ` void.
 * Sem argumento: sala fechada de parede macia com uma porta de 4 células no lado norte
 * (x 8 a 12, y 0 a 1) e uma parede interna em x = 10, de y 10 a 19.
 */
export function gridRows(): string[] {
  const rows: string[] = [];
  for (let cy = 0; cy < 20; cy += 1) {
    let row = '';
    for (let cx = 0; cx < 20; cx += 1) {
      const border = cx === 0 || cy === 0 || cx === 19 || cy === 19;
      const door = cy === 0 && cx >= 8 && cx < 12;
      const inner = cx === 10 && cy >= 10;
      row += door ? '.' : border || inner ? 's' : '.';
    }
    rows.push(row);
  }
  return rows;
}

const CHAR_MATERIAL: Readonly<Record<string, MaterialName>> = {
  '#': 'wall_hard',
  s: 'wall_soft',
  '.': 'floor',
  ' ': 'void',
};

export function encodeRows(rows: readonly string[]): string {
  const cells: number[] = [];
  for (const row of rows) {
    for (const char of row) {
      cells.push(MATERIAL_IDS[CHAR_MATERIAL[char] ?? 'void']);
    }
  }
  return encodeBase64(Uint8Array.from(cells));
}

/** Mapa de treino válido: 1 spawn de cada time e 2 waypoints. */
export function validGymMap(): MapDefinition {
  return {
    id: 'test_map',
    name: 'Teste',
    kind: 'gym',
    cellSize: 8,
    width: 20,
    height: 20,
    materials: MATERIAL_NAMES.map((name) => ({ id: MATERIAL_IDS[name], name })),
    floors: [{ floorId: 0, cells: encodeRows(gridRows()) }],
    objects: {
      anchors: [],
      reinforceSlots: [],
      spawnAttack: [{ id: 'spawn_a', floorId: 0, x: 20, y: 20 }],
      spawnDefense: [{ id: 'zone_d', floorId: 0, rect: { x: 100, y: 100, w: 32, h: 16 } }],
      objectives: [],
      buildingInterior: [],
      cameras: [],
      noDeploy: [],
      botHints: [
        { id: 'wp_1', floorId: 0, kind: 'waypoint', x: 40, y: 40, order: 1, targetId: null },
        { id: 'wp_2', floorId: 0, kind: 'waypoint', x: 120, y: 40, order: 2, targetId: null },
      ],
    },
  };
}

/** Mapa competitivo válido: 3 spawns, par de alvos, porta no vão norte e câmera no prédio. */
export function validCompetitiveMap(): MapDefinition {
  const map = validGymMap();
  return {
    ...map,
    kind: 'competitive',
    objects: {
      ...map.objects,
      spawnAttack: [
        { id: 'spawn_a1', floorId: 0, x: 20, y: 20 },
        { id: 'spawn_a2', floorId: 0, x: 30, y: 20 },
        { id: 'spawn_a3', floorId: 0, x: 40, y: 20 },
      ],
      objectives: [
        {
          id: 'obj_a',
          floorId: 0,
          label: 'A',
          pairId: 'par_1',
          rect: { x: 16, y: 96, w: 32, h: 32 },
        },
        {
          id: 'obj_b',
          floorId: 0,
          label: 'B',
          pairId: 'par_1',
          rect: { x: 96, y: 96, w: 32, h: 32 },
        },
      ],
      anchors: [
        {
          id: 'door_n',
          floorId: 0,
          kind: 'door',
          rect: { x: 64, y: 0, w: 32, h: 8 },
          facing: 'N',
          supports: ['barricade'],
        },
      ],
      buildingInterior: [
        {
          id: 'interior',
          floorId: 0,
          polygon: [
            { x: 8, y: 8 },
            { x: 152, y: 8 },
            { x: 152, y: 152 },
            { x: 8, y: 152 },
          ],
        },
      ],
      cameras: [{ id: 'cam_1', floorId: 0, x: 80, y: 80, rotationDeg: 90, fovDeg: 110 }],
    },
  };
}
