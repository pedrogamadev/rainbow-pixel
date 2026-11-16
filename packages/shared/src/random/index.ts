/** Gerador de números em [0, 1). */
export type RandomSource = () => number;

/**
 * Gerador pseudoaleatório com semente (mulberry32): a mesma semente dá sempre a mesma
 * sequência. Para ferramentas de teste e roteiros reproduzíveis, não para segurança.
 */
export function createSeededRandom(seed: number): RandomSource {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function rotl(value: number, bits: number): number {
  return (value << bits) | (value >>> (32 - bits));
}

/**
 * Número em [0, 1) sorteado a partir de uma semente e de inteiros, sem estado (murmur3 de 32
 * bits sobre as palavras). Os mesmos argumentos dão sempre o mesmo número, então a simulação
 * pode sortear a dispersão de um tiro com `hashRandom(seed, jogador, disparo)` sem guardar
 * gerador nenhum. Cada inteiro entra como 32 bits (`>>> 0`).
 */
export function hashRandom(seed: number, ...values: readonly number[]): number {
  let hash = seed >>> 0;
  for (const value of values) {
    let word = Math.imul(value >>> 0, 0xcc9e2d51);
    word = Math.imul(rotl(word, 15), 0x1b873593);
    hash = rotl(hash ^ word, 13);
    hash = (Math.imul(hash, 5) + 0xe6546b64) | 0;
  }
  hash ^= values.length * 4;
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 4294967296;
}
