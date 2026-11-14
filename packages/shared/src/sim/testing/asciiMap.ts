// Mapas de teste desenhados em texto: `#` é célula sólida, qualquer outro caractere é chão.
// Só para testes; fica fora do build (tsconfig.build.json).

import { SIM_CONFIG } from '../../config/index.js';
import type { CollisionMap } from '../collision.js';

export interface AsciiMap extends CollisionMap {
  /** Centro da célula (cx, cy), em px. */
  cellCenter(cx: number, cy: number): { x: number; y: number };
}

export function asciiMap(
  rows: readonly string[],
  cellSize: number = SIM_CONFIG.cellSize,
): AsciiMap {
  const height = rows.length;
  const width = Math.max(...rows.map((row) => row.length));
  return {
    cellSize,
    width,
    height,
    isSolid(cx, cy) {
      if (cx < 0 || cy < 0 || cx >= width || cy >= height) {
        return true;
      }
      return rows[cy]?.charAt(cx) === '#';
    },
    cellCenter(cx, cy) {
      return { x: cx * cellSize + cellSize / 2, y: cy * cellSize + cellSize / 2 };
    },
  };
}

/** Mapa aberto de `width` x `height` células, cercado por parede. */
export function openMap(width: number, height: number): AsciiMap {
  const rows: string[] = [];
  for (let cy = 0; cy < height; cy += 1) {
    const border = cy === 0 || cy === height - 1;
    rows.push(border ? '#'.repeat(width) : `#${'.'.repeat(width - 2)}#`);
  }
  return asciiMap(rows);
}

/** Mapa aberto com células sólidas extras nas posições dadas. */
export function mapWithWalls(
  width: number,
  height: number,
  isWall: (cx: number, cy: number) => boolean,
): AsciiMap {
  const rows: string[] = [];
  for (let cy = 0; cy < height; cy += 1) {
    let row = '';
    for (let cx = 0; cx < width; cx += 1) {
      const border = cx === 0 || cy === 0 || cx === width - 1 || cy === height - 1;
      row += border || isWall(cx, cy) ? '#' : '.';
    }
    rows.push(row);
  }
  return asciiMap(rows);
}
