// Hitscan (escopo, seção 4.1): o tiro é um raio instantâneo. Ele para na primeira célula sólida
// do grid (raycast.ts) ou no primeiro círculo de jogador que cruzar, o que vier antes. Neste
// marco toda célula sólida bloqueia o tiro; penetração fica para o marco 0.4.

import { SIM_CONFIG } from '../config/index.js';
import type { CollisionMap } from './collision.js';
import { direction, mapDiagonal, raycast } from './raycast.js';
import type { Vec2 } from './types.js';

/** Um jogador que o raio pode acertar, na posição em que o tiro o enxerga. */
export interface ShotTarget {
  readonly playerId: string;
  readonly x: number;
  readonly y: number;
}

export interface HitscanResult {
  /** Onde o raio parou: na parede, no jogador atingido ou na borda do mapa. */
  readonly end: Vec2;
  /** Distância de `origin` até `end`. */
  readonly distance: number;
  /** Jogador atingido. `null`: o raio parou na parede. */
  readonly target: ShotTarget | null;
}

/**
 * Distância ao longo do raio até entrar no círculo, ou `null` se o raio não o cruza.
 * Origem dentro do círculo conta como acerto na distância 0.
 */
export function rayCircleDistance(
  origin: Vec2,
  dir: Vec2,
  center: Vec2,
  radius: number,
): number | null {
  const mx = center.x - origin.x;
  const my = center.y - origin.y;
  const outside = mx * mx + my * my - radius * radius;
  if (outside <= 0) {
    return 0;
  }
  const along = mx * dir.x + my * dir.y;
  if (along <= 0) {
    return null;
  }
  const discriminant = along * along - outside;
  if (discriminant < 0) {
    return null;
  }
  return along - Math.sqrt(discriminant);
}

/**
 * Lança o tiro de `origin` no ângulo `angle` contra o grid e os alvos. O atirador não deve
 * estar em `targets` (quem chama filtra o atirador e os mortos). Empate na distância fica com
 * o menor playerId, para o resultado não depender da ordem da lista.
 */
export function hitscan(
  map: CollisionMap,
  origin: Vec2,
  angle: number,
  targets: readonly ShotTarget[],
  radius: number = SIM_CONFIG.playerRadius,
): HitscanResult {
  const dir = direction(angle);
  const wall = raycast(map, origin, dir, mapDiagonal(map));
  let best: { target: ShotTarget; distance: number } | null = null;
  for (const target of targets) {
    const distance = rayCircleDistance(origin, dir, target, radius);
    if (distance === null || distance > wall.distance) {
      continue;
    }
    if (
      best === null ||
      distance < best.distance ||
      (distance === best.distance && target.playerId < best.target.playerId)
    ) {
      best = { target, distance };
    }
  }
  const distance = best?.distance ?? wall.distance;
  return {
    end: { x: origin.x + dir.x * distance, y: origin.y + dir.y * distance },
    distance,
    target: best?.target ?? null,
  };
}
