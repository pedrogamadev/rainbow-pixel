// Posição inicial de cada jogador (marco 0.2): time 0 nos pontos de spawn_attack, time 1 em
// pontos dentro das zonas de spawn_defense. Distribuição determinística pela ordem de entrada.
// Rounds e escolha de spawn ficam para o marco 0.6.

import type { MapDefinition } from '@rainbow-pixel/maps';
import type { TeamIndex, Vec2 } from '@rainbow-pixel/shared';

export interface SpawnRequest {
  readonly playerId: string;
  readonly team: TeamIndex;
}

export class NoSpawnError extends Error {
  constructor(mapId: string, team: TeamIndex) {
    super(`O mapa ${mapId} não tem spawn para o time ${team}.`);
    this.name = 'NoSpawnError';
  }
}

/** `players` na ordem de entrada na sala. */
export function assignSpawns(
  map: MapDefinition,
  players: readonly SpawnRequest[],
  floorId = 0,
): Map<string, Vec2> {
  const attack = map.objects.spawnAttack.filter((spawn) => spawn.floorId === floorId);
  const zones = map.objects.spawnDefense.filter((zone) => zone.floorId === floorId);
  const attackers = players.filter((player) => player.team === 0);
  const defenders = players.filter((player) => player.team === 1);
  if (attackers.length > 0 && attack.length === 0) throw new NoSpawnError(map.id, 0);
  if (defenders.length > 0 && zones.length === 0) throw new NoSpawnError(map.id, 1);

  const spawns = new Map<string, Vec2>();
  attackers.forEach((player, index) => {
    const point = attack[index % attack.length];
    if (point !== undefined) spawns.set(player.playerId, { x: point.x, y: point.y });
  });

  // Cada zona recebe defensores em rodízio; dentro da zona, ficam lado a lado na linha do meio.
  defenders.forEach((player, index) => {
    const zoneIndex = index % zones.length;
    const zone = zones[zoneIndex];
    if (zone === undefined) return;
    const inZone = Math.ceil((defenders.length - zoneIndex) / zones.length);
    const slot = Math.floor(index / zones.length);
    const { x, y, w, h } = zone.rect;
    spawns.set(player.playerId, { x: x + (w * (slot + 1)) / (inZone + 1), y: y + h / 2 });
  });
  return spawns;
}
