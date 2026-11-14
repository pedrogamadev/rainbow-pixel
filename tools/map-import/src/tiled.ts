// Parte do formato JSON do Tiled (.tmj e .tsj) que o importador lê.
// Referência: https://doc.mapeditor.org/en/stable/reference/json-map-format/

import { z } from 'zod';

const propertySchema = z.object({
  name: z.string(),
  type: z.string().optional(),
  value: z.unknown(),
});

export const propertiesSchema = z.array(propertySchema).optional();
export type TiledProperties = z.output<typeof propertiesSchema>;

const pointSchema = z.object({ x: z.number(), y: z.number() });

export const tiledObjectSchema = z.object({
  id: z.number().int(),
  name: z.string().optional(),
  /** Classe do objeto. O Tiled 1.9+ grava em `type`; versões antigas, em `class`. */
  type: z.string().optional(),
  class: z.string().optional(),
  x: z.number(),
  y: z.number(),
  width: z.number().optional(),
  height: z.number().optional(),
  rotation: z.number().optional(),
  point: z.boolean().optional(),
  ellipse: z.boolean().optional(),
  polygon: z.array(pointSchema).optional(),
  polyline: z.array(pointSchema).optional(),
  gid: z.number().optional(),
  properties: propertiesSchema,
});
export type TiledObject = z.output<typeof tiledObjectSchema>;

export const tileLayerSchema = z.object({
  type: z.literal('tilelayer'),
  name: z.string(),
  width: z.number().int(),
  height: z.number().int(),
  data: z.union([z.array(z.number()), z.string()]),
  encoding: z.enum(['csv', 'base64']).optional(),
  compression: z.string().optional(),
  properties: propertiesSchema,
});
export type TiledTileLayer = z.output<typeof tileLayerSchema>;

export const objectLayerSchema = z.object({
  type: z.literal('objectgroup'),
  name: z.string(),
  objects: z.array(tiledObjectSchema),
  properties: propertiesSchema,
});
export type TiledObjectLayer = z.output<typeof objectLayerSchema>;

/** Camada de qualquer tipo, lida por cima; o tipo decide o schema completo. */
export const anyLayerSchema = z.looseObject({
  type: z.string(),
  name: z.string(),
  properties: propertiesSchema,
});
export type TiledAnyLayer = z.output<typeof anyLayerSchema>;

export const tilesetSchema = z.object({
  name: z.string().optional(),
  tiles: z
    .array(
      z.object({
        id: z.number().int(),
        properties: propertiesSchema,
      }),
    )
    .optional(),
});
export type TiledTileset = z.output<typeof tilesetSchema>;

export const tilesetRefSchema = z.looseObject({
  firstgid: z.number().int().positive(),
  /** Tileset externo (.tsj), relativo ao arquivo do mapa. */
  source: z.string().optional(),
});

export const tiledMapSchema = z.object({
  orientation: z.string(),
  infinite: z.boolean().optional(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  tilewidth: z.number().int().positive(),
  tileheight: z.number().int().positive(),
  layers: z.array(anyLayerSchema),
  tilesets: z.array(tilesetRefSchema),
  properties: propertiesSchema,
});
export type TiledMap = z.output<typeof tiledMapSchema>;

/** Bits de espelhamento e rotação que o Tiled grava no alto do gid. */
const GID_MASK = 0x0fffffff;

export function stripGidFlags(gid: number): number {
  return gid & GID_MASK;
}

export function findProperty(properties: TiledProperties, name: string): unknown {
  return properties?.find((property) => property.name === name)?.value;
}
