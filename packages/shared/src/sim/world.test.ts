import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSeededRandom } from '../random/index.js';
import { TICK_SECONDS } from './movement.js';
import { mapWithWalls } from './testing/asciiMap.js';
import { MOVE_MODES } from './types.js';
import type { MoveAxis, MoveInput, PlayerSimState } from './types.js';
import { createWorld, stepWorld } from './world.js';

const map = mapWithWalls(
  120,
  80,
  (cx, cy) =>
    (cx === 40 && cy < 50) ||
    (cy === 40 && cx > 60) ||
    (cx >= 20 && cx < 24 && cy >= 60 && cy < 64) ||
    (cx >= 90 && cx < 92 && cy >= 10 && cy < 30),
);

const players: readonly PlayerSimState[] = [
  { playerId: 'a', x: 100, y: 100, aimAngle: 0, moveMode: 'walk' },
  { playerId: 'b', x: 700, y: 100, aimAngle: 0, moveMode: 'walk' },
  { playerId: 'c', x: 100, y: 500, aimAngle: 0, moveMode: 'walk' },
  { playerId: 'd', x: 700, y: 500, aimAngle: 0, moveMode: 'walk' },
];

/** Sequência de inputs de 1000 ticks para os 4 jogadores, sempre a mesma para a mesma semente. */
function inputSequence(seed: number): ReadonlyMap<string, MoveInput>[] {
  const random = createSeededRandom(seed);
  const axes: readonly MoveAxis[] = [-1, 0, 1];
  const sequence: Map<string, MoveInput>[] = [];
  for (let tick = 0; tick < 1000; tick += 1) {
    const inputs = new Map<string, MoveInput>();
    for (const player of players) {
      // Às vezes o jogador fica sem input no tick.
      if (random() < 0.1) continue;
      inputs.set(player.playerId, {
        moveX: axes[Math.floor(random() * 3)] ?? 0,
        moveY: axes[Math.floor(random() * 3)] ?? 0,
        aimAngle: random() * Math.PI * 2 - Math.PI,
        moveMode: MOVE_MODES[Math.floor(random() * MOVE_MODES.length)] ?? 'walk',
      });
    }
    sequence.push(inputs);
  }
  return sequence;
}

function run(sequence: readonly ReadonlyMap<string, MoveInput>[]) {
  let world = createWorld(map, players);
  for (const inputs of sequence) {
    world = stepWorld(world, inputs, TICK_SECONDS);
  }
  return world;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('determinismo', () => {
  it('1000 ticks com a mesma sequência de inputs dão o mesmo estado final', () => {
    const sequence = inputSequence(2026);
    const first = run(sequence);
    const second = run(inputSequence(2026));
    expect(first.tick).toBe(1000);
    expect(second.players).toEqual(first.players);
    // Os jogadores se mexeram de verdade.
    expect(first.players).not.toEqual(players);
  });

  it('não usa Math.random nem relógio', () => {
    const sequence = inputSequence(99);
    const fail = () => {
      throw new Error('a simulação não pode usar aleatoriedade nem relógio');
    };
    vi.spyOn(Math, 'random').mockImplementation(fail);
    vi.spyOn(Date, 'now').mockImplementation(fail);
    // O pacote compartilhado não tem os tipos do DOM nem do Node; `performance` existe nos dois.
    const { performance } = globalThis as { performance?: { now(): number } };
    if (performance !== undefined) {
      vi.spyOn(performance, 'now').mockImplementation(fail);
    }
    expect(() => run(sequence)).not.toThrow();
  });

  it('não altera o mundo recebido', () => {
    const world = createWorld(map, players);
    const before = world.players.map((player) => ({ ...player }));
    stepWorld(world, inputSequence(1)[0] ?? new Map(), TICK_SECONDS);
    expect(world.players).toEqual(before);
    expect(world.tick).toBe(0);
  });
});
