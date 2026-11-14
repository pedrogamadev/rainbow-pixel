import { describe, expect, it } from 'vitest';
import {
  UnknownMapError,
  createCollisionGrid,
  getMap,
  hasMap,
  listMaps,
  patrolWaypoints,
} from './index.js';

describe('catálogo de mapas', () => {
  it('tem o gym_01', () => {
    expect(listMaps()).toEqual([{ id: 'gym_01', name: 'Ginásio 01', kind: 'gym' }]);
    expect(hasMap('gym_01')).toBe(true);
    expect(hasMap('nao_existe')).toBe(false);
  });

  it('recusa mapa desconhecido', () => {
    expect(() => getMap('nao_existe')).toThrow(UnknownMapError);
  });

  it('carrega cada mapa uma vez', () => {
    expect(getMap('gym_01')).toBe(getMap('gym_01'));
  });
});

describe('gym_01', () => {
  const map = getMap('gym_01');

  it('tem cerca de 160x100 células de 8 px', () => {
    expect(map).toMatchObject({ kind: 'gym', cellSize: 8, width: 160, height: 100 });
  });

  it('tem 3 spawns de ataque, uma zona de spawn de defesa e pelo menos 8 waypoints', () => {
    expect(map.objects.spawnAttack).toHaveLength(3);
    expect(map.objects.spawnDefense).toHaveLength(1);
    expect(patrolWaypoints(map).length).toBeGreaterThanOrEqual(8);
  });

  it('é fechado por paredes: as bordas são sólidas', () => {
    const grid = createCollisionGrid(map);
    for (let cx = 0; cx < map.width; cx += 1) {
      expect(grid.isSolid(cx, 0)).toBe(true);
      expect(grid.isSolid(cx, map.height - 1)).toBe(true);
    }
    for (let cy = 0; cy < map.height; cy += 1) {
      expect(grid.isSolid(0, cy)).toBe(true);
      expect(grid.isSolid(map.width - 1, cy)).toBe(true);
    }
  });

  it('tem paredes macias e reforçadas', () => {
    const grid = createCollisionGrid(map);
    const counts = new Map<string, number>();
    for (let cy = 0; cy < map.height; cy += 1) {
      for (let cx = 0; cx < map.width; cx += 1) {
        const material = grid.materialAt(cx, cy);
        counts.set(material, (counts.get(material) ?? 0) + 1);
      }
    }
    expect(counts.get('wall_soft')).toBeGreaterThan(0);
    expect(counts.get('wall_hard')).toBeGreaterThan(0);
    expect(counts.get('floor')).toBeGreaterThan(map.width * map.height * 0.6);
  });
});
