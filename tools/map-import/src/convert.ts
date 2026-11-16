// Converte um mapa do Tiled para MapDefinition, seguindo a convenção de camadas da seção 7.2
// do escopo. Lê todas as camadas da convenção, mesmo as que o jogo ainda não usa.

import { gunzipSync, inflateSync } from 'node:zlib';
import {
  ANCHOR_KINDS,
  ANCHOR_SUPPORTS,
  BOT_HINT_KINDS,
  FACINGS,
  MAP_KINDS,
  MATERIAL_IDS,
  MATERIAL_NAMES,
  OBJECTIVE_LABELS,
  encodeBase64,
  mapDefinitionSchema,
} from '@rainbow-pixel/maps/format';
import type {
  MapDefinition,
  MapObjects,
  MapPoint,
  MapRect,
  MaterialName,
} from '@rainbow-pixel/maps/format';
import { MAP_LAYER, NO_OBJECT, issue } from './issues.js';
import type { ImportIssue } from './issues.js';
import {
  anyLayerSchema,
  findProperty,
  objectLayerSchema,
  stripGidFlags,
  tileLayerSchema,
  tiledMapSchema,
  tilesetSchema,
} from './tiled.js';
import type {
  TiledAnyLayer,
  TiledObject,
  TiledObjectLayer,
  TiledProperties,
  TiledTileLayer,
} from './tiled.js';

/** Camadas da convenção (escopo, seção 7.2). */
export const LAYER_NAMES = {
  structure: 'structure',
  anchors: 'anchors',
  reinforceSlots: 'reinforce_slots',
  gameplay: 'gameplay',
  botHints: 'bot_hints',
} as const;

/** Tipos de objeto da camada gameplay. */
const GAMEPLAY_TYPES = [
  'spawn_attack',
  'spawn_defense',
  'objective',
  'building_interior',
  'camera',
  'no_deploy',
] as const;

export interface TiledSource {
  /** Id do mapa: nome do arquivo sem extensão. */
  readonly id: string;
  /** Conteúdo do .tmj, já lido como JSON. */
  readonly json: unknown;
  /** Lê um tileset externo (.tsj) pelo caminho relativo ao mapa. */
  readonly loadTileset: (source: string) => unknown;
}

export interface ConvertResult {
  readonly map: MapDefinition | null;
  readonly issues: readonly ImportIssue[];
}

function oneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return values.some((item) => item === value);
}

function describeZodError(error: { issues: readonly { path: PropertyKey[]; message: string }[] }) {
  return error.issues
    .map((item) =>
      item.path.length > 0 ? `${item.path.join('.')}: ${item.message}` : item.message,
    )
    .join('; ');
}

/** Lê propriedades do Tiled e anota o problema quando o tipo não é o esperado. */
class PropertyReader {
  constructor(
    private readonly issues: ImportIssue[],
    private readonly layer: string,
    private readonly objectId: string,
    private readonly properties: TiledProperties,
  ) {}

  private wrongType(name: string, expected: string): undefined {
    this.issues.push(
      issue(
        this.layer,
        this.objectId,
        'property_type',
        `a propriedade ${name} precisa ser ${expected}`,
      ),
    );
    return undefined;
  }

  string(name: string): string | undefined {
    const value = findProperty(this.properties, name);
    if (value === undefined) return undefined;
    return typeof value === 'string' ? value.trim() : this.wrongType(name, 'texto');
  }

  int(name: string): number | undefined {
    const value = findProperty(this.properties, name);
    if (value === undefined) return undefined;
    return typeof value === 'number' && Number.isInteger(value)
      ? value
      : this.wrongType(name, 'um número inteiro');
  }

  number(name: string): number | undefined {
    const value = findProperty(this.properties, name);
    if (value === undefined) return undefined;
    return typeof value === 'number' && Number.isFinite(value)
      ? value
      : this.wrongType(name, 'um número');
  }

  required<T>(name: string, value: T | undefined, description: string): T | undefined {
    if (value === undefined && findProperty(this.properties, name) === undefined) {
      this.issues.push(
        issue(
          this.layer,
          this.objectId,
          'required_property',
          `falta a propriedade ${name} (${description})`,
        ),
      );
    }
    return value;
  }
}

class Converter {
  readonly issues: ImportIssue[] = [];

  constructor(private readonly source: TiledSource) {}

  private add(layer: string, objectId: string, rule: string, message: string): void {
    this.issues.push(issue(layer, objectId, rule, message));
  }

  run(): MapDefinition | null {
    const parsed = tiledMapSchema.safeParse(this.source.json);
    if (!parsed.success) {
      this.add(
        MAP_LAYER,
        NO_OBJECT,
        'tiled_format',
        `arquivo do Tiled inválido (${describeZodError(parsed.error)})`,
      );
      return null;
    }
    const tiled = parsed.data;
    if (tiled.orientation !== 'orthogonal') {
      this.add(MAP_LAYER, NO_OBJECT, 'tiled_format', 'o mapa precisa ter orientação ortogonal');
    }
    if (tiled.infinite === true) {
      this.add(
        MAP_LAYER,
        NO_OBJECT,
        'tiled_format',
        'mapa infinito não é aceito; desmarque "Infinite" no Tiled',
      );
    }
    if (tiled.tilewidth !== tiled.tileheight) {
      this.add(
        MAP_LAYER,
        NO_OBJECT,
        'cell_size',
        'o tile precisa ser quadrado (tilewidth igual a tileheight)',
      );
    }

    const mapProps = new PropertyReader(this.issues, MAP_LAYER, NO_OBJECT, tiled.properties);
    const name = mapProps.required('name', mapProps.string('name'), 'nome do mapa');
    const kind = mapProps.required('kind', mapProps.string('kind'), 'gym ou competitive');
    if (kind !== undefined && !oneOf(MAP_KINDS, kind)) {
      this.add(
        MAP_LAYER,
        NO_OBJECT,
        'map_kind',
        `kind precisa ser gym ou competitive (é "${kind}")`,
      );
    }

    const materials = this.readTilesets(tiled.tilesets);
    const layers = this.flattenLayers(tiled.layers);
    const floors = this.readStructure(layers, materials, tiled.width, tiled.height);
    const objects = this.readObjects(layers);

    if (
      this.issues.length > 0 ||
      name === undefined ||
      kind === undefined ||
      !oneOf(MAP_KINDS, kind)
    ) {
      return null;
    }

    const candidate = {
      id: this.source.id,
      name,
      kind,
      cellSize: tiled.tilewidth,
      width: tiled.width,
      height: tiled.height,
      materials: MATERIAL_NAMES.map((material) => ({ id: MATERIAL_IDS[material], name: material })),
      floors,
      objects,
    };
    const checked = mapDefinitionSchema.safeParse(candidate);
    if (!checked.success) {
      this.add(
        MAP_LAYER,
        NO_OBJECT,
        'map_format',
        `mapa gerado inválido (${describeZodError(checked.error)})`,
      );
      return null;
    }
    return checked.data;
  }

  /** Material de cada gid, pela propriedade `material` dos tiles. */
  private readTilesets(refs: TiledMapRefs): Map<number, MaterialName> {
    const materials = new Map<number, MaterialName>();
    for (const ref of refs) {
      let json: unknown = ref;
      const label = ref.source ?? `firstgid ${ref.firstgid}`;
      if (ref.source !== undefined) {
        if (!/\.(tsj|json)$/i.test(ref.source)) {
          this.add(
            `(tileset ${label})`,
            NO_OBJECT,
            'tiled_format',
            'tileset externo precisa estar em JSON (.tsj)',
          );
          continue;
        }
        try {
          json = this.source.loadTileset(ref.source);
        } catch {
          this.add(
            `(tileset ${label})`,
            NO_OBJECT,
            'tiled_format',
            'não foi possível ler o tileset externo',
          );
          continue;
        }
      }
      const tileset = tilesetSchema.safeParse(json);
      if (!tileset.success) {
        this.add(
          `(tileset ${label})`,
          NO_OBJECT,
          'tiled_format',
          `tileset inválido (${describeZodError(tileset.error)})`,
        );
        continue;
      }
      const layer = `(tileset ${tileset.data.name ?? label})`;
      for (const tile of tileset.data.tiles ?? []) {
        const objectId = `tile ${tile.id}`;
        const props = new PropertyReader(this.issues, layer, objectId, tile.properties);
        const material = props.string('material');
        if (material === undefined) continue;
        if (!oneOf(MATERIAL_NAMES, material)) {
          this.add(layer, objectId, 'material', `material desconhecido "${material}"`);
          continue;
        }
        materials.set(ref.firstgid + tile.id, material);
      }
    }
    return materials;
  }

  /** Abre os grupos de camadas do Tiled. */
  private flattenLayers(layers: readonly TiledAnyLayer[]): TiledAnyLayer[] {
    const flat: TiledAnyLayer[] = [];
    for (const layer of layers) {
      if (layer.type === 'group') {
        const children = Array.isArray(layer['layers']) ? (layer['layers'] as unknown[]) : [];
        const parsed = children.flatMap((child) => {
          const result = anyLayerSchema.safeParse(child);
          return result.success ? [result.data] : [];
        });
        flat.push(...this.flattenLayers(parsed));
      } else {
        flat.push(layer);
      }
    }
    return flat;
  }

  private readGids(layer: TiledTileLayer): number[] | null {
    if (Array.isArray(layer.data)) {
      return layer.data;
    }
    if (layer.encoding !== 'base64') {
      this.add(layer.name, NO_OBJECT, 'tiled_format', 'dados da camada em formato desconhecido');
      return null;
    }
    let bytes = Buffer.from(layer.data, 'base64');
    try {
      if (layer.compression === 'zlib') bytes = inflateSync(bytes);
      else if (layer.compression === 'gzip') bytes = gunzipSync(bytes);
      else if (layer.compression !== undefined && layer.compression !== '') {
        this.add(
          layer.name,
          NO_OBJECT,
          'tiled_format',
          `compressão ${layer.compression} não é aceita (use CSV, zlib ou gzip)`,
        );
        return null;
      }
    } catch {
      this.add(
        layer.name,
        NO_OBJECT,
        'tiled_format',
        'não foi possível descomprimir os dados da camada',
      );
      return null;
    }
    const gids: number[] = [];
    for (let offset = 0; offset + 4 <= bytes.length; offset += 4) {
      gids.push(bytes.readUInt32LE(offset));
    }
    return gids;
  }

  /** Camadas `structure`: uma por andar, com a propriedade floorId (0 se não tiver). */
  private readStructure(
    layers: readonly TiledAnyLayer[],
    materials: ReadonlyMap<number, MaterialName>,
    width: number,
    height: number,
  ): MapDefinition['floors'] {
    const structures = layers.filter((layer) => layer.name === LAYER_NAMES.structure);
    if (structures.length === 0) {
      this.add(
        LAYER_NAMES.structure,
        NO_OBJECT,
        'structure_layer',
        'falta a camada de tiles structure',
      );
      return [];
    }
    const floors: MapDefinition['floors'] = [];
    for (const raw of structures) {
      const parsed = tileLayerSchema.safeParse(raw);
      if (!parsed.success) {
        this.add(raw.name, NO_OBJECT, 'structure_layer', 'a camada structure precisa ser de tiles');
        continue;
      }
      const layer = parsed.data;
      const floorId =
        new PropertyReader(this.issues, layer.name, NO_OBJECT, layer.properties).int('floorId') ??
        0;
      if (floors.some((floor) => floor.floorId === floorId)) {
        this.add(
          layer.name,
          NO_OBJECT,
          'structure_layer',
          `há mais de uma camada structure no andar ${floorId}`,
        );
        continue;
      }
      if (layer.width !== width || layer.height !== height) {
        this.add(
          layer.name,
          NO_OBJECT,
          'structure_layer',
          'a camada structure precisa ter o tamanho do mapa',
        );
        continue;
      }
      const gids = this.readGids(layer);
      if (gids === null) continue;
      if (gids.length !== width * height) {
        this.add(
          layer.name,
          NO_OBJECT,
          'structure_layer',
          `a camada tem ${gids.length} tiles; o esperado é ${width * height}`,
        );
        continue;
      }
      const cells = new Uint8Array(width * height);
      const unknownGids = new Set<number>();
      gids.forEach((rawGid, index) => {
        const gid = stripGidFlags(rawGid);
        // Célula sem tile é fora do mapa.
        const material = gid === 0 ? 'void' : materials.get(gid);
        if (material === undefined) {
          unknownGids.add(gid);
          return;
        }
        cells[index] = MATERIAL_IDS[material];
      });
      for (const gid of unknownGids) {
        this.add(
          layer.name,
          `gid ${gid}`,
          'material',
          'tile sem a propriedade material no tileset',
        );
      }
      floors.push({ floorId, cells: encodeBase64(cells) });
    }
    return floors;
  }

  private readObjects(layers: readonly TiledAnyLayer[]): MapObjects {
    const objects: MapObjects = {
      anchors: [],
      reinforceSlots: [],
      spawnAttack: [],
      spawnDefense: [],
      objectives: [],
      buildingInterior: [],
      cameras: [],
      noDeploy: [],
      botHints: [],
    };
    const known: readonly string[] = [
      LAYER_NAMES.anchors,
      LAYER_NAMES.reinforceSlots,
      LAYER_NAMES.gameplay,
      LAYER_NAMES.botHints,
    ];
    for (const raw of layers) {
      if (!known.includes(raw.name)) {
        // Camadas fora da convenção (ajuda visual no Tiled) não entram no mapa.
        continue;
      }
      const parsed = objectLayerSchema.safeParse(raw);
      if (!parsed.success) {
        this.add(
          raw.name,
          NO_OBJECT,
          'object_layer',
          `a camada ${raw.name} precisa ser de objetos`,
        );
        continue;
      }
      const layer = parsed.data;
      const layerFloor = new PropertyReader(
        this.issues,
        layer.name,
        NO_OBJECT,
        layer.properties,
      ).int('floorId');
      for (const object of layer.objects) {
        this.readObject(layer, layerFloor, object, objects);
      }
    }
    return objects;
  }

  private readObject(
    layer: TiledObjectLayer,
    layerFloor: number | undefined,
    object: TiledObject,
    out: MapObjects,
  ): void {
    const name = object.name?.trim() ?? '';
    const objectId = name === '' ? `#${object.id}` : name;
    if (name === '') {
      this.add(layer.name, objectId, 'object_id', 'objeto sem nome; o nome do objeto é o id dele');
      return;
    }
    const props = new PropertyReader(this.issues, layer.name, objectId, object.properties);
    const base = { id: name, floorId: props.int('floorId') ?? layerFloor ?? 0 };
    const type = (object.type ?? object.class ?? '').trim();
    const shapes = new ShapeReader(this.issues, layer.name, objectId, object);

    switch (layer.name) {
      case LAYER_NAMES.anchors: {
        const kind = props.string('kind') ?? type;
        if (!oneOf(ANCHOR_KINDS, kind)) {
          this.add(
            layer.name,
            objectId,
            'object_type',
            `âncora precisa ser door, window ou hatch (é "${kind}")`,
          );
          return;
        }
        const facing = props.required('facing', props.string('facing'), 'N, S, E ou W');
        if (facing !== undefined && !oneOf(FACINGS, facing)) {
          this.add(
            layer.name,
            objectId,
            'anchor_facing',
            `facing precisa ser N, S, E ou W (é "${facing}")`,
          );
          return;
        }
        // Lista separada por vírgula, por exemplo "barricade,entry_denial".
        const listed = (props.string('supports') ?? '')
          .split(',')
          .map((item) => item.trim())
          .filter((item) => item !== '');
        const supports = listed.filter((item) => oneOf(ANCHOR_SUPPORTS, item));
        if (supports.length !== listed.length) {
          const unknown = listed.filter((item) => !oneOf(ANCHOR_SUPPORTS, item));
          this.add(
            layer.name,
            objectId,
            'anchor_supports',
            `supports desconhecido: ${unknown.join(', ')}`,
          );
          return;
        }
        const rect = shapes.rect();
        if (rect === null || facing === undefined) return;
        out.anchors.push({ ...base, kind, rect, facing, supports });
        return;
      }
      case LAYER_NAMES.reinforceSlots: {
        const rect = shapes.rect();
        if (rect !== null) out.reinforceSlots.push({ ...base, rect });
        return;
      }
      case LAYER_NAMES.gameplay:
        this.readGameplayObject(layer.name, objectId, type, base, props, shapes, out);
        return;
      case LAYER_NAMES.botHints: {
        if (!oneOf(BOT_HINT_KINDS, type)) {
          this.add(
            layer.name,
            objectId,
            'object_type',
            `tipo de dica desconhecido "${type}" (use ${BOT_HINT_KINDS.join(', ')})`,
          );
          return;
        }
        const position = shapes.position();
        if (position === null) return;
        out.botHints.push({
          ...base,
          kind: type,
          ...position,
          order: props.int('order') ?? null,
          targetId: props.string('targetId') ?? null,
        });
        return;
      }
    }
  }

  private readGameplayObject(
    layer: string,
    objectId: string,
    type: string,
    base: { readonly id: string; readonly floorId: number },
    props: PropertyReader,
    shapes: ShapeReader,
    out: MapObjects,
  ): void {
    if (!oneOf(GAMEPLAY_TYPES, type)) {
      this.add(
        layer,
        objectId,
        'object_type',
        `tipo desconhecido "${type}" (use ${GAMEPLAY_TYPES.join(', ')})`,
      );
      return;
    }
    switch (type) {
      case 'spawn_attack': {
        const position = shapes.position();
        if (position !== null) out.spawnAttack.push({ ...base, ...position });
        return;
      }
      case 'spawn_defense': {
        const rect = shapes.rect();
        if (rect !== null) out.spawnDefense.push({ ...base, rect });
        return;
      }
      case 'no_deploy': {
        const rect = shapes.rect();
        if (rect !== null) out.noDeploy.push({ ...base, rect });
        return;
      }
      case 'building_interior': {
        const polygon = shapes.polygon();
        if (polygon !== null) out.buildingInterior.push({ ...base, polygon });
        return;
      }
      case 'objective': {
        const label = props.required('label', props.string('label'), 'A ou B');
        const pairId = props.required('pairId', props.string('pairId'), 'id do par de alvos');
        if (label !== undefined && !oneOf(OBJECTIVE_LABELS, label)) {
          this.add(layer, objectId, 'objective_label', `label precisa ser A ou B (é "${label}")`);
          return;
        }
        const rect = shapes.rect();
        if (rect === null || label === undefined || pairId === undefined || pairId === '') return;
        out.objectives.push({ ...base, label, pairId, rect });
        return;
      }
      case 'camera': {
        const fovDeg = props.required('fov', props.number('fov'), 'abertura do cone, em graus');
        const position = shapes.position();
        if (position === null || fovDeg === undefined) return;
        const rotationDeg = props.number('rotation') ?? shapes.rotation();
        out.cameras.push({ ...base, ...position, rotationDeg, fovDeg });
        return;
      }
    }
  }
}

type TiledMapRefs = ReturnType<typeof tiledMapSchema.parse>['tilesets'];

/** Lê a geometria de um objeto do Tiled no formato pedido por cada tipo. */
class ShapeReader {
  constructor(
    private readonly issues: ImportIssue[],
    private readonly layer: string,
    private readonly objectId: string,
    private readonly object: TiledObject,
  ) {}

  private fail(message: string): null {
    this.issues.push(issue(this.layer, this.objectId, 'object_shape', message));
    return null;
  }

  private isPoint(): boolean {
    const { point, polygon, width = 0, height = 0 } = this.object;
    return point === true || (polygon === undefined && width === 0 && height === 0);
  }

  rotation(): number {
    return this.object.rotation ?? 0;
  }

  rect(): MapRect | null {
    const { x, y, width = 0, height = 0, polygon, polyline, ellipse } = this.object;
    if (this.isPoint() || polygon !== undefined || polyline !== undefined || ellipse === true) {
      return this.fail('precisa ser um retângulo');
    }
    if (this.rotation() !== 0) {
      return this.fail('retângulo girado não é aceito');
    }
    return { x, y, w: width, h: height };
  }

  /** Ponto, ou o centro de um retângulo. */
  position(): MapPoint | null {
    const { x, y, width = 0, height = 0, polygon, polyline } = this.object;
    if (polygon !== undefined || polyline !== undefined) {
      return this.fail('precisa ser um ponto (ou um retângulo, que vale pelo centro)');
    }
    if (this.isPoint()) {
      return { x, y };
    }
    if (this.rotation() !== 0) {
      return this.fail('retângulo girado não é aceito');
    }
    return { x: x + width / 2, y: y + height / 2 };
  }

  /** Polígono (vértices em px, absolutos) ou retângulo convertido em polígono. */
  polygon(): MapPoint[] | null {
    const { x, y, polygon } = this.object;
    if (polygon !== undefined) {
      if (this.rotation() !== 0) {
        return this.fail('polígono girado não é aceito');
      }
      if (polygon.length < 3) {
        return this.fail('o polígono precisa de pelo menos 3 vértices');
      }
      return polygon.map((vertex) => ({ x: x + vertex.x, y: y + vertex.y }));
    }
    const rect = this.rect();
    if (rect === null) return null;
    return [
      { x: rect.x, y: rect.y },
      { x: rect.x + rect.w, y: rect.y },
      { x: rect.x + rect.w, y: rect.y + rect.h },
      { x: rect.x, y: rect.y + rect.h },
    ];
  }
}

export function convertTiledMap(source: TiledSource): ConvertResult {
  const converter = new Converter(source);
  const map = converter.run();
  return { map: converter.issues.length === 0 ? map : null, issues: converter.issues };
}
