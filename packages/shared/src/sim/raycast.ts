// Raio contra o grid do mapa, por DDA (Amanatides & Woo): percorre as células que o raio cruza,
// na ordem, e para na primeira sólida. Usado pelo tiro (hitscan) e pela linha de visada dos bots.
// Célula fora do mapa conta como sólida, então o raio sempre para na borda.

import type { CollisionMap } from './collision.js';
import type { Vec2 } from './types.js';

/**
 * Tolerância para decidir que o raio passa exatamente por uma quina (cruza as duas linhas da
 * grade no mesmo ponto). Sem ela, o arredondamento de cos e sin deixaria o raio escapar pela
 * fresta diagonal entre duas células sólidas.
 */
const CORNER_EPSILON = 1e-9;

export interface RaycastHit {
  /** Distância percorrida até a face da primeira célula sólida, ou `maxDistance`. */
  readonly distance: number;
  /** Primeira célula sólida no caminho. `null`: nada até `maxDistance`. */
  readonly cell: { readonly cx: number; readonly cy: number } | null;
}

/** Direção unitária de um ângulo em radianos. */
export function direction(angle: number): Vec2 {
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

/**
 * Lança um raio de `origin` na direção unitária `dir` e devolve a primeira célula sólida.
 * Se o raio passa exatamente por uma quina, as duas células vizinhas da quina contam: se
 * qualquer uma for sólida, o raio para ali.
 */
export function raycast(
  map: CollisionMap,
  origin: Vec2,
  dir: Vec2,
  maxDistance: number,
): RaycastHit {
  const size = map.cellSize;
  let cx = Math.floor(origin.x / size);
  let cy = Math.floor(origin.y / size);
  if (map.isSolid(cx, cy)) {
    return { distance: 0, cell: { cx, cy } };
  }

  const stepX = dir.x > 0 ? 1 : dir.x < 0 ? -1 : 0;
  const stepY = dir.y > 0 ? 1 : dir.y < 0 ? -1 : 0;
  // Distância ao longo do raio entre duas linhas verticais (X) ou horizontais (Y) da grade.
  const deltaX = stepX === 0 ? Number.POSITIVE_INFINITY : size / Math.abs(dir.x);
  const deltaY = stepY === 0 ? Number.POSITIVE_INFINITY : size / Math.abs(dir.y);
  // Distância até a próxima linha vertical (X) ou horizontal (Y).
  let nextX =
    stepX === 0
      ? Number.POSITIVE_INFINITY
      : ((stepX > 0 ? (cx + 1) * size : cx * size) - origin.x) / dir.x;
  let nextY =
    stepY === 0
      ? Number.POSITIVE_INFINITY
      : ((stepY > 0 ? (cy + 1) * size : cy * size) - origin.y) / dir.y;

  for (;;) {
    const distance = Math.min(nextX, nextY);
    if (distance > maxDistance) {
      return { distance: maxDistance, cell: null };
    }
    if (Math.abs(nextX - nextY) <= CORNER_EPSILON) {
      // Quina: o raio toca as duas vizinhas antes de entrar na diagonal.
      if (map.isSolid(cx + stepX, cy)) {
        return { distance, cell: { cx: cx + stepX, cy } };
      }
      if (map.isSolid(cx, cy + stepY)) {
        return { distance, cell: { cx, cy: cy + stepY } };
      }
      cx += stepX;
      cy += stepY;
      nextX += deltaX;
      nextY += deltaY;
    } else if (nextX < nextY) {
      cx += stepX;
      nextX += deltaX;
    } else {
      cy += stepY;
      nextY += deltaY;
    }
    if (map.isSolid(cx, cy)) {
      return { distance, cell: { cx, cy } };
    }
  }
}

/** Maior distância que um raio pode andar dentro do mapa: a diagonal, com folga. */
export function mapDiagonal(map: CollisionMap): number {
  return Math.hypot(map.width, map.height) * map.cellSize + map.cellSize;
}

/** Diz se não há célula sólida no segmento de `from` até `to`. */
export function hasLineOfSight(map: CollisionMap, from: Vec2, to: Vec2): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) {
    return !map.isSolid(Math.floor(from.x / map.cellSize), Math.floor(from.y / map.cellSize));
  }
  const hit = raycast(map, from, { x: dx / length, y: dy / length }, length);
  return hit.cell === null;
}
