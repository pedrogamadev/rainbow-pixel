// Simulação pura, de passo fixo e determinística: o mesmo estado com a mesma sequência de
// inputs dá o mesmo resultado. Usada pelo servidor (verdade), pelo cliente (previsão), pelo
// cliente headless e pelos bots. TypeScript puro: sem DOM, PixiJS, Colyseus, APIs do Node,
// Math.random ou relógio.
export * from './collision.js';
export * from './hitscan.js';
export * from './movement.js';
export * from './raycast.js';
export * from './types.js';
export * from './world.js';
