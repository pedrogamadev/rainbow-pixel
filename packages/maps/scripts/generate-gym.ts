// pnpm --filter @rainbow-pixel/maps generate:gym
// Gera tiled/gym_01.tmj, um mapa de teste no formato do Tiled, e o tileset tiled/materials.png.
// Depois de gerar, rode `pnpm maps:import` para atualizar generated/gym_01.json.
//
// Planta (em células de 8 px, 160x100):
// - borda de wall_hard e, a oeste, um pátio aberto com os 3 spawns de ataque;
// - prédio com 4 salas (NO, NE, SO, SE) em volta de dois corredores em cruz;
// - paredes das salas de wall_soft com vãos de porta de 6 células e entradas no muro oeste;
// - pilares de wall_hard nas salas e nos corredores, para testar o deslizamento;
// - zona de spawn de defesa na sala SE e 8 waypoints formando um circuito pelas 4 salas.

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync } from 'node:zlib';

const CELL = 8;
const WIDTH = 160;
const HEIGHT = 100;

type Material = 'floor' | 'wall_soft' | 'wall_hard' | 'void';

/** Tiles do tileset, na ordem do PNG. O gid de cada tile é o índice + 1. */
const TILES: readonly { material: Material; rgb: readonly [number, number, number] }[] = [
  { material: 'floor', rgb: [42, 47, 58] },
  { material: 'wall_soft', rgb: [176, 138, 90] },
  { material: 'wall_hard', rgb: [107, 115, 133] },
  { material: 'void', rgb: [11, 12, 16] },
];

function gidOf(material: Material): number {
  return TILES.findIndex((tile) => tile.material === material) + 1;
}

// ---------------------------------------------------------------------------
// Estrutura
// ---------------------------------------------------------------------------

const grid: Material[] = new Array<Material>(WIDTH * HEIGHT).fill('floor');

/** Preenche as células [x0, x1) x [y0, y1). */
function fill(x0: number, y0: number, x1: number, y1: number, material: Material): void {
  for (let cy = y0; cy < y1; cy += 1) {
    for (let cx = x0; cx < x1; cx += 1) {
      grid[cy * WIDTH + cx] = material;
    }
  }
}

// Borda do mapa.
fill(0, 0, WIDTH, 2, 'wall_hard');
fill(0, HEIGHT - 2, WIDTH, HEIGHT, 'wall_hard');
fill(0, 0, 2, HEIGHT, 'wall_hard');
fill(WIDTH - 2, 0, WIDTH, HEIGHT, 'wall_hard');

// Muro oeste do prédio, com uma entrada para cada sala do lado oeste e a entrada principal.
fill(30, 2, 32, HEIGHT - 2, 'wall_hard');
fill(30, 20, 32, 26, 'floor');
fill(30, 46, 32, 54, 'floor');
fill(30, 74, 32, 80, 'floor');

// Paredes das salas ao longo do corredor horizontal (y 44 a 56) e do vertical (x 89 a 101).
fill(32, 42, 89, 44, 'wall_soft'); // sul da sala NO
fill(87, 2, 89, 44, 'wall_soft'); // leste da sala NO
fill(101, 42, WIDTH - 2, 44, 'wall_soft'); // sul da sala NE
fill(101, 2, 103, 44, 'wall_soft'); // oeste da sala NE
fill(32, 56, 89, 58, 'wall_soft'); // norte da sala SO
fill(87, 56, 89, HEIGHT - 2, 'wall_soft'); // leste da sala SO
fill(101, 56, WIDTH - 2, 58, 'wall_soft'); // norte da sala SE
fill(101, 56, 103, HEIGHT - 2, 'wall_soft'); // oeste da sala SE

interface Door {
  readonly id: string;
  /** Células [x0, x1) x [y0, y1) do vão. */
  readonly cells: readonly [number, number, number, number];
  readonly facing: 'N' | 'S' | 'E' | 'W';
}

const DOORS: readonly Door[] = [
  { id: 'door_nw_west', cells: [30, 20, 32, 26], facing: 'W' },
  { id: 'door_main_west', cells: [30, 46, 32, 54], facing: 'W' },
  { id: 'door_sw_west', cells: [30, 74, 32, 80], facing: 'W' },
  { id: 'door_nw_south', cells: [56, 42, 62, 44], facing: 'S' },
  { id: 'door_nw_east', cells: [87, 20, 89, 26], facing: 'E' },
  { id: 'door_ne_west', cells: [101, 20, 103, 26], facing: 'W' },
  { id: 'door_ne_south', cells: [127, 42, 133, 44], facing: 'S' },
  { id: 'door_se_north', cells: [127, 56, 133, 58], facing: 'N' },
  { id: 'door_se_west', cells: [101, 74, 103, 80], facing: 'W' },
  { id: 'door_sw_east', cells: [87, 74, 89, 80], facing: 'E' },
  { id: 'door_sw_north', cells: [56, 56, 62, 58], facing: 'N' },
];

for (const door of DOORS) {
  const [x0, y0, x1, y1] = door.cells;
  fill(x0, y0, x1, y1, 'floor');
}

// Pilares, fora das linhas retas entre os waypoints.
const PILLARS: readonly (readonly [number, number, number, number])[] = [
  [40, 6, 44, 10], // sala NO
  [66, 28, 70, 32],
  [40, 30, 44, 34],
  [110, 8, 114, 12], // sala NE
  [140, 26, 144, 30],
  [140, 66, 144, 70], // sala SE
  [112, 66, 114, 68],
  [36, 64, 40, 68], // sala SO
  [64, 84, 68, 88],
  [70, 45, 73, 48], // corredor horizontal
  [120, 51, 123, 54],
  [93, 30, 97, 34], // corredor vertical
  [93, 66, 97, 70],
];

for (const [x0, y0, x1, y1] of PILLARS) {
  fill(x0, y0, x1, y1, 'wall_hard');
}

// ---------------------------------------------------------------------------
// Objetos (em px)
// ---------------------------------------------------------------------------

type PropertyType = 'string' | 'int' | 'float' | 'bool';

interface TiledProperty {
  readonly name: string;
  readonly type: PropertyType;
  readonly value: string | number | boolean;
}

interface TiledObject {
  id: number;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  visible: boolean;
  point?: boolean;
  polygon?: readonly { x: number; y: number }[];
  properties?: readonly TiledProperty[];
}

let nextObjectId = 1;

function object(fields: Omit<TiledObject, 'id' | 'rotation' | 'visible'>): TiledObject {
  return { id: nextObjectId++, rotation: 0, visible: true, ...fields };
}

function point(name: string, type: string, x: number, y: number, properties?: TiledProperty[]) {
  return object({ name, type, x, y, width: 0, height: 0, point: true, properties });
}

function rect(name: string, type: string, x: number, y: number, width: number, height: number) {
  return object({ name, type, x, y, width, height });
}

const anchors = DOORS.map((door) => {
  const [x0, y0, x1, y1] = door.cells;
  return {
    ...rect(door.id, 'door', x0 * CELL, y0 * CELL, (x1 - x0) * CELL, (y1 - y0) * CELL),
    properties: [
      { name: 'facing', type: 'string', value: door.facing },
      { name: 'supports', type: 'string', value: 'barricade' },
    ] satisfies TiledProperty[],
  };
});

// Os spawns de ataque ficam alinhados com as entradas do muro oeste.
const gameplay = [
  point('spawn_attack_1', 'spawn_attack', 96, 184),
  point('spawn_attack_2', 'spawn_attack', 96, 400),
  point('spawn_attack_3', 'spawn_attack', 96, 616),
  rect('spawn_defense_1', 'spawn_defense', 880, 688, 320, 72),
  rect('building_interior_1', 'building_interior', 32 * CELL, 2 * CELL, 126 * CELL, 96 * CELL),
];

// Circuito pelas 4 salas, passando pelo centro das portas. Cada trecho é uma linha reta livre.
const WAYPOINTS: readonly (readonly [number, number])[] = [
  [472, 400], // corredor, em frente às portas das salas NO e SO
  [472, 184], // sala NO
  [760, 184], // corredor vertical, norte
  [1040, 184], // sala NE
  [1040, 400], // corredor, em frente às portas das salas NE e SE
  [1040, 616], // sala SE
  [760, 616], // corredor vertical, sul
  [472, 616], // sala SO
];

const botHints = WAYPOINTS.map(([x, y], index) =>
  point(`waypoint_${index + 1}`, 'waypoint', x, y, [
    { name: 'order', type: 'int', value: index + 1 },
  ]),
);

// ---------------------------------------------------------------------------
// Arquivo do Tiled
// ---------------------------------------------------------------------------

function objectLayer(id: number, name: string, objects: readonly TiledObject[]) {
  return {
    draworder: 'topdown',
    id,
    name,
    objects,
    opacity: 1,
    type: 'objectgroup',
    visible: true,
    x: 0,
    y: 0,
  };
}

const tmj = {
  compressionlevel: -1,
  height: HEIGHT,
  infinite: false,
  layers: [
    {
      data: grid.map(gidOf),
      height: HEIGHT,
      id: 1,
      name: 'structure',
      opacity: 1,
      type: 'tilelayer',
      visible: true,
      width: WIDTH,
      x: 0,
      y: 0,
    },
    objectLayer(2, 'anchors', anchors),
    objectLayer(3, 'reinforce_slots', []),
    objectLayer(4, 'gameplay', gameplay),
    objectLayer(5, 'bot_hints', botHints),
  ],
  nextlayerid: 6,
  nextobjectid: nextObjectId,
  orientation: 'orthogonal',
  properties: [
    { name: 'kind', type: 'string', value: 'gym' },
    { name: 'name', type: 'string', value: 'Ginásio 01' },
  ],
  renderorder: 'right-down',
  tiledversion: '1.11.2',
  tileheight: CELL,
  tilesets: [
    {
      columns: TILES.length,
      firstgid: 1,
      image: 'materials.png',
      imageheight: CELL,
      imagewidth: CELL * TILES.length,
      margin: 0,
      name: 'materials',
      spacing: 0,
      tilecount: TILES.length,
      tileheight: CELL,
      tiles: TILES.map((tile, index) => ({
        id: index,
        properties: [{ name: 'material', type: 'string', value: tile.material }],
      })),
      tilewidth: CELL,
    },
  ],
  tilewidth: CELL,
  type: 'map',
  version: '1.10',
  width: WIDTH,
};

/** JSON com 1 espaço de recuo e a lista de tiles da camada em uma linha só. */
function toTmjText(value: unknown): string {
  const compactData = (key: string, item: unknown): unknown =>
    key === 'data' && Array.isArray(item) ? `@@DATA@@${item.join(',')}@@` : item;
  const text = JSON.stringify(value, compactData, 1);
  return `${text.replace(/"@@DATA@@([0-9,]*)@@"/, '[$1]')}\n`;
}

// ---------------------------------------------------------------------------
// Tileset em PNG (cada tile é um quadrado da cor do material)
// ---------------------------------------------------------------------------

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeAndData = new Uint8Array(4 + data.length);
  typeAndData.set(new TextEncoder().encode(type), 0);
  typeAndData.set(data, 4);
  const chunk = new Uint8Array(12 + data.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length);
  chunk.set(typeAndData, 4);
  view.setUint32(8 + data.length, crc32(typeAndData));
  return chunk;
}

function tilesetPng(): Uint8Array {
  const width = CELL * TILES.length;
  const height = CELL;
  const header = new Uint8Array(13);
  const headerView = new DataView(header.buffer);
  headerView.setUint32(0, width);
  headerView.setUint32(4, height);
  header.set([8, 6, 0, 0, 0], 8); // 8 bits por canal, RGBA, sem entrelaçamento

  const rowLength = 1 + width * 4;
  const raw = new Uint8Array(rowLength * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * rowLength] = 0; // filtro "nenhum"
    for (let x = 0; x < width; x += 1) {
      const tile = TILES[Math.floor(x / CELL)];
      const offset = y * rowLength + 1 + x * 4;
      raw.set([...(tile?.rgb ?? [0, 0, 0]), 255], offset);
    }
  }

  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', new Uint8Array()),
  ];
  const png = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    png.set(part, offset);
    offset += part.length;
  }
  return png;
}

const tiledDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'tiled');
writeFileSync(join(tiledDir, 'gym_01.tmj'), toTmjText(tmj));
writeFileSync(join(tiledDir, 'materials.png'), tilesetPng());
console.info('Gerados tiled/gym_01.tmj e tiled/materials.png. Agora rode pnpm maps:import.');
