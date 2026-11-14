import { deflateSync } from 'node:zlib';
import { createCollisionGrid } from '@rainbow-pixel/maps/format';
import { describe, expect, it } from 'vitest';
import { convertTiledMap } from './convert.js';
import type { ImportIssue } from './issues.js';

type Json = Record<string, unknown>;

/** Mapa do Tiled de 4x3 tiles: 1 chão, 2 parede macia, 3 parede reforçada. */
function tiledMap(overrides: Json = {}): Json {
  return {
    type: 'map',
    orientation: 'orthogonal',
    infinite: false,
    width: 4,
    height: 3,
    tilewidth: 8,
    tileheight: 8,
    properties: [
      { name: 'name', type: 'string', value: 'Teste' },
      { name: 'kind', type: 'string', value: 'gym' },
    ],
    tilesets: [
      {
        firstgid: 1,
        name: 'materials',
        tiles: [
          { id: 0, properties: [{ name: 'material', type: 'string', value: 'floor' }] },
          { id: 1, properties: [{ name: 'material', type: 'string', value: 'wall_soft' }] },
          { id: 2, properties: [{ name: 'material', type: 'string', value: 'wall_hard' }] },
        ],
      },
    ],
    layers: [
      {
        type: 'tilelayer',
        name: 'structure',
        width: 4,
        height: 3,
        data: [3, 2, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1],
      },
      { type: 'objectgroup', name: 'anchors', objects: [] },
      { type: 'objectgroup', name: 'reinforce_slots', objects: [] },
      {
        type: 'objectgroup',
        name: 'gameplay',
        objects: [
          { id: 1, name: 'spawn_a', type: 'spawn_attack', x: 4, y: 12, point: true },
          { id: 2, name: 'zone_d', type: 'spawn_defense', x: 16, y: 8, width: 16, height: 8 },
        ],
      },
      {
        type: 'objectgroup',
        name: 'bot_hints',
        objects: [
          {
            id: 3,
            name: 'wp_1',
            type: 'waypoint',
            x: 12,
            y: 12,
            point: true,
            properties: [{ name: 'order', type: 'int', value: 1 }],
          },
        ],
      },
    ],
    ...overrides,
  };
}

function convert(json: unknown, tilesets: Record<string, unknown> = {}) {
  return convertTiledMap({
    id: 'teste',
    json,
    loadTileset: (source) => {
      if (!(source in tilesets)) throw new Error('não existe');
      return tilesets[source];
    },
  });
}

function layers(map: Json): Json[] {
  return map['layers'] as Json[];
}

function only(issues: readonly ImportIssue[]): ImportIssue {
  expect(issues).toHaveLength(1);
  const [first] = issues;
  if (first === undefined) throw new Error('sem problema');
  return first;
}

describe('convertTiledMap', () => {
  it('converte estrutura, objetos e propriedades', () => {
    const { map, issues } = convert(tiledMap());
    expect(issues).toEqual([]);
    expect(map).toMatchObject({
      id: 'teste',
      name: 'Teste',
      kind: 'gym',
      cellSize: 8,
      width: 4,
      height: 3,
    });
    if (map === null) return;
    const grid = createCollisionGrid(map);
    expect([0, 1, 2, 3].map((cx) => grid.materialAt(cx, 0))).toEqual([
      'wall_hard',
      'wall_soft',
      'floor',
      'void',
    ]);
    expect(map.objects.spawnAttack).toEqual([{ id: 'spawn_a', floorId: 0, x: 4, y: 12 }]);
    expect(map.objects.spawnDefense).toEqual([
      { id: 'zone_d', floorId: 0, rect: { x: 16, y: 8, w: 16, h: 8 } },
    ]);
    expect(map.objects.botHints).toEqual([
      { id: 'wp_1', floorId: 0, kind: 'waypoint', x: 12, y: 12, order: 1, targetId: null },
    ]);
  });

  it('lê dados da camada em base64 com zlib e ignora os bits de espelhamento do gid', () => {
    const gids = [3, 2, 1, 0, 1, 1, 1, 1, 1, 1, 1, 0x80000000 | 2];
    const bytes = new Uint8Array(gids.length * 4);
    const view = new DataView(bytes.buffer);
    gids.forEach((gid, index) => view.setUint32(index * 4, gid, true));
    const map = tiledMap();
    layers(map)[0] = {
      type: 'tilelayer',
      name: 'structure',
      width: 4,
      height: 3,
      encoding: 'base64',
      compression: 'zlib',
      data: Buffer.from(deflateSync(bytes)).toString('base64'),
    };
    const result = convert(map);
    expect(result.issues).toEqual([]);
    if (result.map === null) return;
    expect(createCollisionGrid(result.map).materialAt(3, 2)).toBe('wall_soft');
  });

  it('lê tileset externo em JSON', () => {
    const map = tiledMap({ tilesets: [{ firstgid: 1, source: 'materials.tsj' }] });
    const external = (tiledMap()['tilesets'] as Json[])[0];
    const result = convert(map, { 'materials.tsj': external });
    expect(result.issues).toEqual([]);
  });

  it('lê camadas dentro de grupos', () => {
    const map = tiledMap();
    map['layers'] = [{ type: 'group', name: 'andar 0', layers: layers(map) }];
    expect(convert(map).issues).toEqual([]);
  });

  it('aponta a falta de nome e de kind do mapa', () => {
    const { issues } = convert(tiledMap({ properties: [] }));
    expect(issues.map((found) => [found.layer, found.rule, found.message])).toEqual([
      ['(mapa)', 'required_property', 'falta a propriedade name (nome do mapa)'],
      ['(mapa)', 'required_property', 'falta a propriedade kind (gym ou competitive)'],
    ]);
  });

  it('aponta material desconhecido no tileset', () => {
    const map = tiledMap();
    const [tileset] = map['tilesets'] as Json[];
    (tileset?.['tiles'] as Json[]).push({
      id: 3,
      properties: [{ name: 'material', type: 'string', value: 'lava' }],
    });
    expect(only(convert(map).issues)).toEqual({
      layer: '(tileset materials)',
      objectId: 'tile 3',
      rule: 'material',
      message: 'material desconhecido "lava"',
    });
  });

  it('aponta tile sem material na estrutura', () => {
    const map = tiledMap();
    layers(map)[0] = { ...layers(map)[0], data: [3, 2, 1, 9, 1, 1, 1, 1, 1, 1, 1, 1] };
    expect(only(convert(map).issues)).toMatchObject({
      layer: 'structure',
      objectId: 'gid 9',
      rule: 'material',
    });
  });

  it('aponta a falta da camada structure', () => {
    const map = tiledMap();
    map['layers'] = layers(map).slice(1);
    expect(only(convert(map).issues)).toMatchObject({
      layer: 'structure',
      rule: 'structure_layer',
    });
  });

  it('aponta objeto sem nome pelo número do Tiled', () => {
    const map = tiledMap();
    (layers(map)[3]?.['objects'] as Json[]).push({
      id: 7,
      type: 'spawn_attack',
      x: 4,
      y: 4,
      point: true,
    });
    expect(only(convert(map).issues)).toEqual({
      layer: 'gameplay',
      objectId: '#7',
      rule: 'object_id',
      message: 'objeto sem nome; o nome do objeto é o id dele',
    });
  });

  it('aponta tipo de objeto desconhecido na camada gameplay', () => {
    const map = tiledMap();
    (layers(map)[3]?.['objects'] as Json[]).push({
      id: 8,
      name: 'x',
      type: 'spawn_ataque',
      x: 4,
      y: 4,
      point: true,
    });
    expect(only(convert(map).issues)).toMatchObject({
      layer: 'gameplay',
      objectId: 'x',
      rule: 'object_type',
    });
  });

  it('aponta âncora sem facing e com supports desconhecido', () => {
    const map = tiledMap();
    (layers(map)[1]?.['objects'] as Json[]).push(
      { id: 9, name: 'door_1', type: 'door', x: 8, y: 0, width: 8, height: 8 },
      {
        id: 10,
        name: 'door_2',
        type: 'door',
        x: 8,
        y: 0,
        width: 8,
        height: 8,
        properties: [
          { name: 'facing', type: 'string', value: 'N' },
          { name: 'supports', type: 'string', value: 'barricade, laser' },
        ],
      },
    );
    expect(convert(map).issues).toEqual([
      {
        layer: 'anchors',
        objectId: 'door_1',
        rule: 'required_property',
        message: 'falta a propriedade facing (N, S, E ou W)',
      },
      {
        layer: 'anchors',
        objectId: 'door_2',
        rule: 'anchor_supports',
        message: 'supports desconhecido: laser',
      },
    ]);
  });

  it('aponta câmera sem fov e forma errada de zona', () => {
    const map = tiledMap();
    (layers(map)[3]?.['objects'] as Json[]).push(
      { id: 11, name: 'cam_1', type: 'camera', x: 8, y: 8, point: true },
      { id: 12, name: 'nd_1', type: 'no_deploy', x: 8, y: 8, point: true },
    );
    expect(convert(map).issues).toEqual([
      {
        layer: 'gameplay',
        objectId: 'cam_1',
        rule: 'required_property',
        message: 'falta a propriedade fov (abertura do cone, em graus)',
      },
      {
        layer: 'gameplay',
        objectId: 'nd_1',
        rule: 'object_shape',
        message: 'precisa ser um retângulo',
      },
    ]);
  });

  it('aponta propriedade com tipo errado', () => {
    const map = tiledMap();
    const objects = layers(map)[4]?.['objects'] as Json[];
    objects[0] = {
      ...objects[0],
      properties: [{ name: 'order', type: 'string', value: 'primeiro' }],
    };
    expect(only(convert(map).issues)).toEqual({
      layer: 'bot_hints',
      objectId: 'wp_1',
      rule: 'property_type',
      message: 'a propriedade order precisa ser um número inteiro',
    });
  });

  it('recusa mapa infinito', () => {
    expect(only(convert(tiledMap({ infinite: true })).issues)).toMatchObject({
      layer: '(mapa)',
      rule: 'tiled_format',
    });
  });
});
