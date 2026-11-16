// Formato de mapa do jogo (escopo, seção 7). O importador de tools/map-import converte os
// arquivos do Tiled para este formato, e o servidor e o cliente leem só ele.

import { z } from 'zod';

/** Materiais das células (escopo, seção 7.1). */
export const MATERIAL_NAMES = ['void', 'floor', 'wall_soft', 'wall_hard', 'barricade'] as const;
export type MaterialName = (typeof MATERIAL_NAMES)[number];

/** Id de cada material nas células geradas pelo importador. */
export const MATERIAL_IDS: Readonly<Record<MaterialName, number>> = {
  void: 0,
  floor: 1,
  wall_soft: 2,
  wall_hard: 3,
  barricade: 4,
};

export const MAP_KINDS = ['gym', 'competitive'] as const;
export type MapKind = (typeof MAP_KINDS)[number];

/** Âncoras de porta, janela e alçapão (escopo, seção 7.3). `hatch` é para o futuro. */
export const ANCHOR_KINDS = ['door', 'window', 'hatch'] as const;
export const FACINGS = ['N', 'S', 'E', 'W'] as const;
/** O que pode ser instalado numa âncora. Só a barricada existe na 1.0. */
export const ANCHOR_SUPPORTS = ['barricade', 'entry_denial', 'deployable_shield'] as const;

export const OBJECTIVE_LABELS = ['A', 'B'] as const;

/** Dicas para os bots, na camada bot_hints (escopo, seção 7.2). */
export const BOT_HINT_KINDS = [
  'waypoint',
  'hold_point',
  'cover',
  'reinforce_priority',
  'barricade_priority',
  'plant_spot',
] as const;
export type BotHintKind = (typeof BOT_HINT_KINDS)[number];

const pointSchema = z.object({ x: z.number(), y: z.number() });

const rectSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number().positive(),
  h: z.number().positive(),
});

/** Todo objeto tem id (único no mapa) e andar. */
const objectBase = {
  id: z.string().min(1),
  floorId: z.number().int().nonnegative(),
};

const anchorSchema = z.object({
  ...objectBase,
  kind: z.enum(ANCHOR_KINDS),
  rect: rectSchema,
  facing: z.enum(FACINGS),
  supports: z.array(z.enum(ANCHOR_SUPPORTS)),
});

const zoneSchema = z.object({ ...objectBase, rect: rectSchema });

const spawnPointSchema = z.object({ ...objectBase, x: z.number(), y: z.number() });

const objectiveSchema = z.object({
  ...objectBase,
  label: z.enum(OBJECTIVE_LABELS),
  /** Os alvos A e B de um par têm o mesmo pairId (escopo, seção 3.2). */
  pairId: z.string().min(1),
  rect: rectSchema,
});

const buildingInteriorSchema = z.object({
  ...objectBase,
  /** Vértices em px, na ordem do contorno. */
  polygon: z.array(pointSchema).min(3),
});

const cameraSchema = z.object({
  ...objectBase,
  x: z.number(),
  y: z.number(),
  /** Direção do centro do cone, em graus, no sentido horário a partir do leste (como no Tiled). */
  rotationDeg: z.number(),
  fovDeg: z.number().positive().max(360),
});

const botHintSchema = z.object({
  ...objectBase,
  kind: z.enum(BOT_HINT_KINDS),
  x: z.number(),
  y: z.number(),
  /** Ordem no circuito (waypoint) ou na prioridade (reinforce_priority, barricade_priority). */
  order: z.number().int().nullable(),
  /** Objeto a que a dica se refere: alvo, âncora ou slot de reforço. */
  targetId: z.string().nullable(),
});

export const mapDefinitionSchema = z.object({
  /** Igual ao nome do arquivo do Tiled, sem extensão. */
  id: z.string().regex(/^[a-z0-9_]+$/),
  name: z.string().min(1),
  kind: z.enum(MAP_KINDS),
  /** Lado da célula, em px. */
  cellSize: z.number().int().positive(),
  /** Largura do mapa, em células. */
  width: z.number().int().positive(),
  /** Altura do mapa, em células. */
  height: z.number().int().positive(),
  /** Tabela id -> nome dos materiais usados em `floors[].cells`. */
  materials: z.array(
    z.object({ id: z.number().int().min(0).max(255), name: z.enum(MATERIAL_NAMES) }),
  ),
  floors: z
    .array(
      z.object({
        floorId: z.number().int().nonnegative(),
        /** Base64 de um Uint8Array com o id do material de cada célula, linha a linha. */
        cells: z.string(),
      }),
    )
    .min(1),
  objects: z.object({
    anchors: z.array(anchorSchema),
    reinforceSlots: z.array(zoneSchema),
    spawnAttack: z.array(spawnPointSchema),
    spawnDefense: z.array(zoneSchema),
    objectives: z.array(objectiveSchema),
    buildingInterior: z.array(buildingInteriorSchema),
    cameras: z.array(cameraSchema),
    noDeploy: z.array(zoneSchema),
    botHints: z.array(botHintSchema),
  }),
});

export type MapDefinition = z.output<typeof mapDefinitionSchema>;
export type MapObjects = MapDefinition['objects'];
export type MapObjectGroup = keyof MapObjects;
export type MapRect = z.output<typeof rectSchema>;
export type MapPoint = z.output<typeof pointSchema>;
export type MapAnchor = z.output<typeof anchorSchema>;
export type MapZone = z.output<typeof zoneSchema>;
export type MapSpawnPoint = z.output<typeof spawnPointSchema>;
export type MapObjective = z.output<typeof objectiveSchema>;
export type MapBuildingInterior = z.output<typeof buildingInteriorSchema>;
export type MapCamera = z.output<typeof cameraSchema>;
export type MapBotHint = z.output<typeof botHintSchema>;

/** Camada do Tiled de onde vem cada grupo de objetos (escopo, seção 7.2). */
export const OBJECT_GROUP_LAYERS: Readonly<Record<MapObjectGroup, string>> = {
  anchors: 'anchors',
  reinforceSlots: 'reinforce_slots',
  spawnAttack: 'gameplay',
  spawnDefense: 'gameplay',
  objectives: 'gameplay',
  buildingInterior: 'gameplay',
  cameras: 'gameplay',
  noDeploy: 'gameplay',
  botHints: 'bot_hints',
};
