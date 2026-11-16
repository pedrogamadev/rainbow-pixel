import { createCollisionGrid } from '@rainbow-pixel/maps';
import type { MapDefinition, MaterialName } from '@rainbow-pixel/maps';
import { Graphics } from 'pixi.js';
import { MATERIAL_COLORS } from './palette';

/**
 * Desenha as células do mapa por material. Cada linha vira poucos retângulos: células
 * vizinhas do mesmo material são juntadas, e o chão é um retângulo só, por baixo de tudo.
 */
export function createMapGraphics(map: MapDefinition, floorId = 0): Graphics {
  const grid = createCollisionGrid(map, floorId);
  const size = map.cellSize;
  const graphics = new Graphics();
  graphics.rect(0, 0, map.width * size, map.height * size).fill(MATERIAL_COLORS.floor);

  for (let cy = 0; cy < map.height; cy += 1) {
    let runStart = 0;
    let runMaterial: MaterialName = grid.materialAt(0, cy);
    for (let cx = 1; cx <= map.width; cx += 1) {
      const material: MaterialName | null = cx < map.width ? grid.materialAt(cx, cy) : null;
      if (material === runMaterial) continue;
      if (runMaterial !== 'floor') {
        graphics
          .rect(runStart * size, cy * size, (cx - runStart) * size, size)
          .fill(MATERIAL_COLORS[runMaterial]);
      }
      if (material !== null) {
        runStart = cx;
        runMaterial = material;
      }
    }
  }
  return graphics;
}
