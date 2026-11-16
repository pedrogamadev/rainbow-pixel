import { describe, expect, it } from 'vitest';
import { SIM_CONFIG } from '../config/index.js';
import { createSeededRandom } from '../random/index.js';
import { hasLineOfSight, mapDiagonal, raycast } from './raycast.js';
import { asciiMap, mapWithWalls, openMap } from './testing/asciiMap.js';

const CELL = SIM_CONFIG.cellSize;

function dirOf(angle: number) {
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

describe('raycast: para na primeira célula sólida', () => {
  // Parede vertical na coluna 20 (x de 160 a 168).
  const wall = mapWithWalls(40, 40, (cx) => cx === 20);

  it('em linha reta, para na face da parede', () => {
    const hit = raycast(wall, { x: 100, y: 100 }, { x: 1, y: 0 }, 1000);
    expect(hit.cell).toEqual({ cx: 20, cy: 12 });
    expect(hit.distance).toBeCloseTo(60, 9);
  });

  it('sem nada até o alcance, devolve o alcance', () => {
    const hit = raycast(openMap(100, 100), { x: 100, y: 100 }, { x: 1, y: 0 }, 50);
    expect(hit).toEqual({ distance: 50, cell: null });
  });

  it('para na borda do mapa (fora do mapa é sólido)', () => {
    const map = asciiMap(['....', '....']);
    const hit = raycast(map, { x: 4, y: 4 }, { x: 1, y: 0 }, 1000);
    expect(hit.cell).toEqual({ cx: 4, cy: 0 });
    expect(hit.distance).toBeCloseTo(4 * CELL - 4, 9);
  });

  it('em qualquer ângulo, nunca entra numa célula sólida antes da primeira', () => {
    const random = createSeededRandom(7);
    const map = mapWithWalls(60, 60, (cx, cy) => (cx * 7 + cy * 13) % 11 === 0);
    for (let sample = 0; sample < 500; sample += 1) {
      const origin = { x: 200 + random() * 80, y: 200 + random() * 80 };
      if (map.isSolid(Math.floor(origin.x / CELL), Math.floor(origin.y / CELL))) continue;
      const dir = dirOf(random() * Math.PI * 2);
      const hit = raycast(map, origin, dir, mapDiagonal(map));
      expect(hit.cell).not.toBeNull();
      // Anda pelo raio em passos pequenos: até a distância devolvida, nenhuma célula sólida.
      for (let t = 0; t < hit.distance - 1e-6; t += 0.25) {
        const cx = Math.floor((origin.x + dir.x * t) / CELL);
        const cy = Math.floor((origin.y + dir.y * t) / CELL);
        expect(map.isSolid(cx, cy)).toBe(false);
      }
      // E logo depois dela, a célula devolvida.
      const after = hit.distance + 1e-6;
      const cell = {
        cx: Math.floor((origin.x + dir.x * after) / CELL),
        cy: Math.floor((origin.y + dir.y * after) / CELL),
      };
      expect(map.isSolid(cell.cx, cell.cy)).toBe(true);
    }
  });

  it('passando exatamente por uma quina entre duas células sólidas, para na quina', () => {
    // Células (1, 0) e (0, 1) sólidas: a diagonal de (0, 0) para (1, 1) passa pela quina.
    const map = asciiMap(['.#..', '#...', '....', '....']);
    const hit = raycast(map, { x: 4, y: 4 }, dirOf(Math.PI / 4), 1000);
    expect(hit.cell).not.toBeNull();
    expect(hit.distance).toBeCloseTo(Math.hypot(4, 4), 6);
  });

  it('passando exatamente pela quina de uma única célula sólida, também para', () => {
    const map = asciiMap(['.#..', '....', '....', '....']);
    const hit = raycast(map, { x: 4, y: 4 }, dirOf(Math.PI / 4), 1000);
    expect(hit.cell).toEqual({ cx: 1, cy: 0 });
    expect(hit.distance).toBeCloseTo(Math.hypot(4, 4), 6);
  });

  it('pela quina, nos 4 sentidos da diagonal', () => {
    // Centro em (16, 16), entre as células (1, 1) e (2, 2); sólidas só as 4 em cruz em volta.
    const map = asciiMap(['......', '..#...', '.#.#..', '..#...', '......', '......']);
    for (const angle of [Math.PI / 4, (3 * Math.PI) / 4, (-3 * Math.PI) / 4, -Math.PI / 4]) {
      const hit = raycast(map, { x: 20, y: 20 }, dirOf(angle), 1000);
      expect(hit.cell).not.toBeNull();
      expect(hit.distance).toBeCloseTo(Math.hypot(4, 4), 6);
    }
  });

  it('origem dentro de célula sólida para na hora', () => {
    const map = asciiMap(['#.']);
    expect(raycast(map, { x: 2, y: 2 }, { x: 1, y: 0 }, 100)).toEqual({
      distance: 0,
      cell: { cx: 0, cy: 0 },
    });
  });
});

describe('hasLineOfSight', () => {
  const wall = mapWithWalls(40, 40, (cx, cy) => cx === 20 && cy < 20);

  it('parede no meio do segmento bloqueia', () => {
    expect(hasLineOfSight(wall, { x: 100, y: 100 }, { x: 250, y: 100 })).toBe(false);
  });

  it('segmento livre não bloqueia, mesmo terminando antes da parede', () => {
    expect(hasLineOfSight(wall, { x: 100, y: 200 }, { x: 250, y: 200 })).toBe(true);
    expect(hasLineOfSight(wall, { x: 100, y: 100 }, { x: 150, y: 100 })).toBe(true);
  });
});
