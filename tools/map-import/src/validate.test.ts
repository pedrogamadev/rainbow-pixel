import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createCollisionGrid } from '@rainbow-pixel/maps/format';
import { describe, expect, it } from 'vitest';
import { formatIssue } from './issues.js';
import type { ImportIssue } from './issues.js';
import {
  DEFAULT_GENERATED_DIR,
  DEFAULT_TILED_DIR,
  importMapFile,
  renderMapJson,
} from './importer.js';
import { encodeRows, gridRows, validCompetitiveMap, validGymMap } from './testing.js';
import { anchorSitsInWallGap, validateMap } from './validate.js';

function only(issues: readonly ImportIssue[]): ImportIssue {
  expect(issues).toHaveLength(1);
  const [first] = issues;
  if (first === undefined) throw new Error('sem problema');
  return first;
}

function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`sem item na posição ${index}`);
  return item;
}

describe('gym_01', () => {
  const result = importMapFile(join(DEFAULT_TILED_DIR, 'gym_01.tmj'));

  it('é válido', () => {
    expect(result.issues).toEqual([]);
    expect(result.map).not.toBeNull();
  });

  it('o gerado versionado está atualizado', () => {
    if (result.map === null) throw new Error('gym_01 inválido');
    const committed = readFileSync(join(DEFAULT_GENERATED_DIR, 'gym_01.json'), 'utf8');
    expect(renderMapJson(result.map)).toBe(committed);
  });

  it('as portas ficam sobre vãos de parede, como num mapa competitivo', () => {
    const { map } = result;
    if (map === null) throw new Error('gym_01 inválido');
    const grid = createCollisionGrid(map);
    expect(map.objects.anchors.length).toBeGreaterThan(0);
    for (const anchor of map.objects.anchors) {
      expect(anchorSitsInWallGap(anchor, grid)).toBe(true);
    }
  });
});

describe('regras para todo mapa', () => {
  it('os mapas de teste são válidos', () => {
    expect(validateMap(validGymMap())).toEqual([]);
    expect(validateMap(validCompetitiveMap())).toEqual([]);
  });

  it('cellSize 8', () => {
    const map = { ...validGymMap(), cellSize: 16 };
    expect(only(validateMap(map))).toEqual({
      layer: '(mapa)',
      objectId: '-',
      rule: 'cell_size',
      message: 'o tile precisa ter 8 px (tem 16)',
    });
  });

  it('ids únicos', () => {
    const map = validGymMap();
    map.objects.botHints.push({ ...at(map.objects.botHints, 0), id: 'spawn_a' });
    expect(only(validateMap(map))).toEqual({
      layer: 'bot_hints',
      objectId: 'spawn_a',
      rule: 'unique_ids',
      message: 'id repetido (já usado na camada gameplay)',
    });
  });

  it('todo objeto dentro do mapa', () => {
    const map = validGymMap();
    map.objects.spawnDefense[0] = {
      id: 'zone_d',
      floorId: 0,
      rect: { x: 150, y: 100, w: 40, h: 8 },
    };
    expect(only(validateMap(map))).toEqual({
      layer: 'gameplay',
      objectId: 'zone_d',
      rule: 'inside_map',
      message: 'objeto fora do mapa (160x160 px)',
    });
  });

  it('todo objeto num andar que existe', () => {
    const map = validGymMap();
    map.objects.spawnAttack[0] = { id: 'spawn_a', floorId: 1, x: 20, y: 20 };
    expect(only(validateMap(map))).toMatchObject({
      layer: 'gameplay',
      objectId: 'spawn_a',
      rule: 'object_floor',
      message: 'o andar 1 não existe no mapa',
    });
  });

  it('pelo menos 1 spawn de ataque', () => {
    const map = validGymMap();
    map.objects.spawnAttack = [];
    expect(only(validateMap(map))).toEqual({
      layer: 'gameplay',
      objectId: '-',
      rule: 'spawn_per_team',
      message: 'o mapa precisa de pelo menos 1 spawn_attack',
    });
  });

  it('pelo menos 1 spawn de defesa', () => {
    const map = validGymMap();
    map.objects.spawnDefense = [];
    expect(only(validateMap(map))).toMatchObject({
      rule: 'spawn_per_team',
      message: 'o mapa precisa de pelo menos 1 spawn_defense',
    });
  });

  it('waypoint em célula não sólida', () => {
    const map = validGymMap();
    // x 84, y 100: célula (10, 12), na parede interna.
    map.objects.botHints[1] = { ...at(map.objects.botHints, 1), x: 84, y: 100 };
    expect(only(validateMap(map))).toEqual({
      layer: 'bot_hints',
      objectId: 'wp_2',
      rule: 'waypoint_walkable',
      message: 'waypoint em célula sólida (wall_soft)',
    });
  });

  it('células do andar no tamanho do mapa', () => {
    const map = {
      ...validGymMap(),
      floors: [{ floorId: 0, cells: encodeRows(gridRows().slice(1)) }],
    };
    expect(validateMap(map)[0]).toMatchObject({ layer: '(mapa)', rule: 'floor_cells' });
  });
});

describe('regras extras do mapa competitivo', () => {
  it('pelo menos 3 spawns de ataque', () => {
    const map = validCompetitiveMap();
    map.objects.spawnAttack.pop();
    expect(only(validateMap(map))).toEqual({
      layer: 'gameplay',
      objectId: '-',
      rule: 'attack_spawn_count',
      message: 'mapa competitivo precisa de pelo menos 3 spawn_attack (tem 2)',
    });
  });

  it('o mapa de treino não exige 3 spawns de ataque', () => {
    const map = validGymMap();
    expect(map.objects.spawnAttack).toHaveLength(1);
    expect(validateMap(map)).toEqual([]);
  });

  it('alvo A sem par B', () => {
    const map = validCompetitiveMap();
    map.objects.objectives[1] = { ...at(map.objects.objectives, 1), pairId: 'par_2' };
    const issues = validateMap(map);
    expect(issues).toHaveLength(2);
    expect(issues[0]).toEqual({
      layer: 'gameplay',
      objectId: 'obj_a',
      rule: 'objective_pair',
      message: 'o par "par_1" precisa de exatamente um alvo A e um alvo B (tem 1 A e 0 B)',
    });
    expect(issues[1]).toMatchObject({ objectId: 'obj_b', rule: 'objective_pair' });
  });

  it('dois alvos A no mesmo par', () => {
    const map = validCompetitiveMap();
    map.objects.objectives[1] = { ...at(map.objects.objectives, 1), label: 'A' };
    expect(validateMap(map).map((found) => found.message)).toEqual([
      'o par "par_1" precisa de exatamente um alvo A e um alvo B (tem 2 A e 0 B)',
      'o par "par_1" precisa de exatamente um alvo A e um alvo B (tem 2 A e 0 B)',
    ]);
  });

  it('sem nenhum alvo', () => {
    const map = validCompetitiveMap();
    map.objects.objectives = [];
    expect(only(validateMap(map))).toMatchObject({ objectId: '-', rule: 'objective_pair' });
  });

  it('porta sobre um vão de parede', () => {
    const map = validCompetitiveMap();
    // Mesma largura, mas deslocada para cima da parede ao lado do vão.
    map.objects.anchors[0] = { ...at(map.objects.anchors, 0), rect: { x: 96, y: 0, w: 32, h: 8 } };
    expect(only(validateMap(map))).toEqual({
      layer: 'anchors',
      objectId: 'door_n',
      rule: 'anchor_in_wall_gap',
      message: 'porta ou janela precisa ficar sobre um vão de parede, com parede nas duas pontas',
    });
  });

  it('porta mais larga que o vão também falha', () => {
    const map = validCompetitiveMap();
    map.objects.anchors[0] = { ...at(map.objects.anchors, 0), rect: { x: 64, y: 0, w: 24, h: 8 } };
    expect(only(validateMap(map))).toMatchObject({ rule: 'anchor_in_wall_gap' });
  });

  it('porta com facing errado para a parede falha', () => {
    const map = validCompetitiveMap();
    map.objects.anchors[0] = { ...at(map.objects.anchors, 0), facing: 'E' };
    expect(only(validateMap(map))).toMatchObject({ rule: 'anchor_in_wall_gap' });
  });

  it('câmera dentro de building_interior', () => {
    const map = validCompetitiveMap();
    map.objects.cameras[0] = { ...at(map.objects.cameras, 0), x: 4, y: 4 };
    expect(only(validateMap(map))).toEqual({
      layer: 'gameplay',
      objectId: 'cam_1',
      rule: 'camera_in_building',
      message: 'câmera fora de building_interior',
    });
  });
});

describe('formatIssue', () => {
  it('aponta camada, objeto e regra', () => {
    const text = formatIssue('tiled/x.tmj', {
      layer: 'gameplay',
      objectId: 'cam_1',
      rule: 'camera_in_building',
      message: 'câmera fora de building_interior',
    });
    expect(text).toBe(
      'tiled/x.tmj: camada "gameplay", objeto "cam_1": câmera fora de building_interior [regra camera_in_building]',
    );
  });
});
