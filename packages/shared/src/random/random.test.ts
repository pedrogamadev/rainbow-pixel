import { describe, expect, it } from 'vitest';
import { createSeededRandom } from './index.js';

function take(seed: number, count: number): number[] {
  const random = createSeededRandom(seed);
  return Array.from({ length: count }, () => random());
}

describe('createSeededRandom', () => {
  it('repete a sequência com a mesma semente', () => {
    expect(take(42, 50)).toEqual(take(42, 50));
  });

  it('muda a sequência com outra semente', () => {
    expect(take(42, 50)).not.toEqual(take(43, 50));
  });

  it('gera valores em [0, 1) espalhados pelo intervalo', () => {
    const values = take(7, 10000);
    expect(values.every((value) => value >= 0 && value < 1)).toBe(true);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    expect(mean).toBeGreaterThan(0.48);
    expect(mean).toBeLessThan(0.52);
    const lowerHalf = values.filter((value) => value < 0.5).length / values.length;
    expect(lowerHalf).toBeGreaterThan(0.48);
    expect(lowerHalf).toBeLessThan(0.52);
  });
});
