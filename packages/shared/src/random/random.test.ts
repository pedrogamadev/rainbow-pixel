import { describe, expect, it } from 'vitest';
import { createSeededRandom, hashRandom } from './index.js';

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

describe('hashRandom', () => {
  it('é uma função pura: os mesmos argumentos dão o mesmo número', () => {
    expect(hashRandom(42, 1, 7)).toBe(hashRandom(42, 1, 7));
    expect(hashRandom(0)).toBe(hashRandom(0));
  });

  it('muda com a semente, com cada inteiro e com a ordem deles', () => {
    const base = hashRandom(42, 1, 7);
    expect(hashRandom(43, 1, 7)).not.toBe(base);
    expect(hashRandom(42, 2, 7)).not.toBe(base);
    expect(hashRandom(42, 1, 8)).not.toBe(base);
    expect(hashRandom(42, 7, 1)).not.toBe(base);
    expect(hashRandom(42, 1, 7, 0)).not.toBe(base);
  });

  it('gera valores em [0, 1) espalhados pelo intervalo', () => {
    const values: number[] = [];
    for (let player = 0; player < 4; player += 1) {
      for (let shot = 0; shot < 2500; shot += 1) {
        values.push(hashRandom(2026, player, shot));
      }
    }
    expect(values.every((value) => value >= 0 && value < 1)).toBe(true);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    expect(mean).toBeGreaterThan(0.48);
    expect(mean).toBeLessThan(0.52);
    // Cada décimo do intervalo recebe perto de 10% dos valores.
    for (let bucket = 0; bucket < 10; bucket += 1) {
      const share =
        values.filter((value) => value >= bucket / 10 && value < (bucket + 1) / 10).length /
        values.length;
      expect(share).toBeGreaterThan(0.085);
      expect(share).toBeLessThan(0.115);
    }
  });

  it('aceita semente de 32 bits e inteiros negativos', () => {
    expect(hashRandom(0xffffffff, -1)).toBeGreaterThanOrEqual(0);
    expect(hashRandom(0xffffffff, -1)).toBeLessThan(1);
  });
});
