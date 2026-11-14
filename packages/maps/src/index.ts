// Catálogo de mapas. Cada mapa vem do importador (pnpm maps:import) em generated/ e é
// validado de novo com o schema ao ser carregado.

import gym01 from '../generated/gym_01.json' with { type: 'json' };
import { mapDefinitionSchema } from './schema.js';
import type { MapDefinition, MapKind, MapPoint } from './schema.js';

export * from './format.js';

const SOURCES: Readonly<Record<string, unknown>> = {
  gym_01: gym01,
};

const loaded = new Map<string, MapDefinition>();

export class UnknownMapError extends Error {
  constructor(id: string) {
    super(`Mapa desconhecido: ${id}`);
    this.name = 'UnknownMapError';
  }
}

export function hasMap(id: string): boolean {
  return Object.hasOwn(SOURCES, id);
}

export function getMap(id: string): MapDefinition {
  const cached = loaded.get(id);
  if (cached !== undefined) {
    return cached;
  }
  if (!hasMap(id)) {
    throw new UnknownMapError(id);
  }
  const map = mapDefinitionSchema.parse(SOURCES[id]);
  loaded.set(id, map);
  return map;
}

export interface MapSummary {
  readonly id: string;
  readonly name: string;
  readonly kind: MapKind;
}

export function listMaps(): readonly MapSummary[] {
  return Object.keys(SOURCES).map((id) => {
    const { name, kind } = getMap(id);
    return { id, name, kind };
  });
}

/**
 * Waypoints de patrulha de um andar, na ordem do circuito (propriedade `order`).
 * Waypoints sem ordem vão para o fim, pela ordem do id.
 */
export function patrolWaypoints(map: MapDefinition, floorId = 0): readonly MapPoint[] {
  return map.objects.botHints
    .filter((hint) => hint.kind === 'waypoint' && hint.floorId === floorId)
    .sort((a, b) => {
      const orderA = a.order ?? Number.POSITIVE_INFINITY;
      const orderB = b.order ?? Number.POSITIVE_INFINITY;
      return orderA !== orderB ? orderA - orderB : a.id.localeCompare(b.id);
    })
    .map((hint) => ({ x: hint.x, y: hint.y }));
}
