import { describe, expect, it } from 'vitest';
import { SIM_CONFIG } from '../config/index.js';
import { hitscan, rayCircleDistance } from './hitscan.js';
import { mapWithWalls, openMap } from './testing/asciiMap.js';

const R = SIM_CONFIG.playerRadius;
const open = openMap(200, 100);

describe('rayCircleDistance', () => {
  it('entra no círculo a raio de distância antes do centro', () => {
    expect(rayCircleDistance({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 100, y: 0 }, R)).toBeCloseTo(
      100 - R,
      9,
    );
  });

  it('passa ao lado do círculo sem tocar', () => {
    expect(rayCircleDistance({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 100, y: R + 0.1 }, R)).toBe(null);
  });

  it('não acerta o que está atrás', () => {
    expect(rayCircleDistance({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: -100, y: 0 }, R)).toBe(null);
  });

  it('origem dentro do círculo é acerto na distância 0', () => {
    expect(rayCircleDistance({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 5, y: 0 }, R)).toBe(0);
  });
});

describe('hitscan', () => {
  const origin = { x: 100, y: 400 };

  it('acerta o primeiro círculo no caminho', () => {
    const result = hitscan(open, origin, 0, [
      { playerId: 'longe', x: 600, y: 400 },
      { playerId: 'perto', x: 300, y: 405 },
    ]);
    expect(result.target?.playerId).toBe('perto');
    expect(result.end.x).toBeLessThan(300);
  });

  it('sem ninguém no caminho, para na parede da borda', () => {
    const result = hitscan(open, origin, 0, [{ playerId: 'fora', x: 600, y: 300 }]);
    expect(result.target).toBeNull();
    // A borda direita do openMap(200, 100) começa em x = 199 * 8.
    expect(result.end.x).toBeCloseTo(199 * 8, 6);
  });

  it('parede entre o atirador e o alvo bloqueia', () => {
    const wall = mapWithWalls(200, 100, (cx) => cx === 40);
    const result = hitscan(wall, origin, 0, [{ playerId: 'alvo', x: 500, y: 400 }]);
    expect(result.target).toBeNull();
    expect(result.end.x).toBeCloseTo(40 * 8, 6);
  });

  it('empate na distância fica com o menor playerId', () => {
    const result = hitscan(open, origin, 0, [
      { playerId: 'b', x: 300, y: 400 },
      { playerId: 'a', x: 300, y: 400 },
    ]);
    expect(result.target?.playerId).toBe('a');
  });
});
