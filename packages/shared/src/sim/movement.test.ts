import { describe, expect, it } from 'vitest';
import { SIM_CONFIG } from '../config/index.js';
import { AIM_NORTH, TICK_SECONDS, moveDirection, stepPlayer } from './movement.js';
import { openMap } from './testing/asciiMap.js';
import { testInput, testPlayer } from './testing/fixtures.js';
import type { MoveAxis, MoveInput, MoveMode, PlayerSimState } from './types.js';
import { createWorld, stepWorld } from './world.js';

const map = openMap(200, 200);
const start: PlayerSimState = testPlayer('p1', 800, 800);

/** Mirando para o norte: o movimento relativo à mira segue os eixos do mundo. */
function move(moveX: MoveAxis, moveY: MoveAxis, moveMode: MoveMode = 'walk'): MoveInput {
  return { moveX, moveY, aimAngle: AIM_NORTH, moveMode };
}

/** Aplica o mesmo input por `ticks` ticks. */
function hold(state: PlayerSimState, input: MoveInput, ticks: number): PlayerSimState {
  let current = state;
  for (let tick = 0; tick < ticks; tick += 1) {
    current = stepPlayer(map, current, input, TICK_SECONDS);
  }
  return current;
}

describe('stepPlayer: velocidade por modo', () => {
  it.each([
    ['walk', 140],
    ['slow', 80],
    ['run', 200],
  ] as const)('%s anda %i px em 1 s', (mode, pxPerSecond) => {
    const end = hold(start, move(1, 0, mode), SIM_CONFIG.tickRate);
    expect(end.x - start.x).toBeCloseTo(pxPerSecond, 9);
    expect(end.y).toBe(start.y);
    expect(end.moveMode).toBe(mode);
  });

  it('usa as velocidades da seção 4 do escopo', () => {
    expect(SIM_CONFIG.moveSpeedPxPerSec).toEqual({ walk: 140, slow: 80, run: 200 });
  });
});

describe('stepPlayer: diagonal normalizada', () => {
  it.each([
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ] as const)('(%i, %i) anda a mesma distância que em linha reta', (moveX, moveY) => {
    const end = hold(start, move(moveX, moveY, 'run'), SIM_CONFIG.tickRate);
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    expect(Math.hypot(dx, dy)).toBeCloseTo(200, 9);
    expect(Math.abs(dx)).toBeCloseTo(200 * Math.SQRT1_2, 9);
    expect(Math.sign(dx)).toBe(moveX);
    expect(Math.sign(dy)).toBe(moveY);
  });
});

describe('moveDirection: movimento relativo à mira', () => {
  const EAST = 0;
  const SOUTH = Math.PI / 2;

  it('mirando para o norte, é exatamente o eixo do mundo', () => {
    expect(moveDirection(move(1, 0))).toEqual({ x: 1, y: 0 });
    expect(moveDirection(move(0, -1))).toEqual({ x: 0, y: -1 });
    expect(moveDirection(move(-1, 1))).toEqual({ x: -Math.SQRT1_2, y: Math.SQRT1_2 });
  });

  it.each([
    ['W', 0, -1, { x: 1, y: 0 }],
    ['S', 0, 1, { x: -1, y: 0 }],
    ['D', 1, 0, { x: 0, y: 1 }],
    ['A', -1, 0, { x: 0, y: -1 }],
  ] as const)('mirando para o leste, %s vai para %o', (_key, moveX, moveY, expected) => {
    const direction = moveDirection({ moveX, moveY, aimAngle: EAST, moveMode: 'walk' });
    expect(direction.x).toBeCloseTo(expected.x, 12);
    expect(direction.y).toBeCloseTo(expected.y, 12);
  });

  it('W anda sempre para onde o jogador mira', () => {
    for (const aimAngle of [-3, -1.2, 0.4, 2.5, 7]) {
      const direction = moveDirection({ moveX: 0, moveY: -1, aimAngle, moveMode: 'walk' });
      expect(direction.x).toBeCloseTo(Math.cos(aimAngle), 12);
      expect(direction.y).toBeCloseTo(Math.sin(aimAngle), 12);
    }
  });

  it('parado, a direção é zero em qualquer mira', () => {
    expect(moveDirection({ moveX: 0, moveY: 0, aimAngle: 1.1, moveMode: 'run' })).toEqual({
      x: 0,
      y: 0,
    });
  });

  it('na diagonal, a direção tem comprimento 1 em qualquer mira', () => {
    const direction = moveDirection({ moveX: 1, moveY: -1, aimAngle: SOUTH, moveMode: 'walk' });
    expect(Math.hypot(direction.x, direction.y)).toBeCloseTo(1, 12);
    // Mirando para o sul, frente e direita (W + D) é sudoeste.
    expect(direction.x).toBeCloseTo(-Math.SQRT1_2, 12);
    expect(direction.y).toBeCloseTo(Math.SQRT1_2, 12);
  });
});

describe('stepPlayer: movimento relativo à mira', () => {
  it('mirando para o leste, W anda 140 px para o leste em 1 s', () => {
    const forward: MoveInput = { moveX: 0, moveY: -1, aimAngle: 0, moveMode: 'walk' };
    const end = hold(start, forward, SIM_CONFIG.tickRate);
    expect(end.x - start.x).toBeCloseTo(140, 9);
    expect(end.y - start.y).toBeCloseTo(0, 9);
  });

  it('correndo de lado, a mira fica presa na direção do movimento', () => {
    const strafe: MoveInput = { moveX: 1, moveY: 0, aimAngle: 0, moveMode: 'run' };
    const end = stepPlayer(map, start, strafe, TICK_SECONDS);
    // Mirando para o leste, D corre para o sul.
    expect(end.aimAngle).toBeCloseTo(Math.PI / 2, 12);
    expect(end.y).toBeGreaterThan(start.y);
  });
});

describe('stepPlayer: sem input', () => {
  it('fica parado, mas segue a mira e o modo do input', () => {
    const input: MoveInput = { moveX: 0, moveY: 0, aimAngle: 1.25, moveMode: 'slow' };
    const end = hold(start, input, 10);
    expect(end).toEqual({ ...start, aimAngle: 1.25, moveMode: 'slow' });
  });

  it('para no tick seguinte ao último input de movimento', () => {
    const moving = hold(start, move(1, 0), 5);
    const stopped = hold(moving, move(0, 0), 5);
    expect(stopped.x).toBe(moving.x);
    expect(stopped.y).toBe(moving.y);
  });

  it('no mundo, jogador sem input no tick não se mexe', () => {
    const other: PlayerSimState = { ...start, playerId: 'p2', x: 400 };
    const world = createWorld(map, [start, other]);
    const next = stepWorld(world, new Map([['p1', { input: testInput(move(1, 0)) }]])).world;
    expect(next.tick).toBe(1);
    expect(next.players[0]?.x).toBeGreaterThan(start.x);
    expect(next.players[1]).toEqual(other);
  });
});
