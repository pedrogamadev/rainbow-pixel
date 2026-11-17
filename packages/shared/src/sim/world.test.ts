import { afterEach, describe, expect, it, vi } from 'vitest';
import { COMBAT_CONFIG } from '../config/index.js';
import { createSeededRandom } from '../random/index.js';
import type { ShotTarget } from './hitscan.js';
import { TICK_MS } from './movement.js';
import { mapWithWalls, openMap } from './testing/asciiMap.js';
import { testInput, testPlayer } from './testing/fixtures.js';
import { MOVE_MODES } from './types.js';
import type { MoveAxis, PlayerInput, PlayerSimState } from './types.js';
import { RESPAWN_TICKS, createWorld, stepWorld } from './world.js';
import type { SimWorld, WorldInput, WorldStepOptions } from './world.js';

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
  testPlayer('a', 100, 100, { team: 0 }),
  testPlayer('b', 700, 100, { team: 1 }),
  testPlayer('c', 100, 500, { team: 0 }),
  testPlayer('d', 700, 500, { team: 1 }),
];

type Inputs = ReadonlyMap<string, WorldInput>;

/** Sequência de inputs de 1000 ticks para os 4 jogadores, sempre a mesma para a mesma semente. */
function inputSequence(seed: number): Inputs[] {
  const random = createSeededRandom(seed);
  const axes: readonly MoveAxis[] = [-1, 0, 1];
  const sequence: Map<string, WorldInput>[] = [];
  for (let tick = 0; tick < 1000; tick += 1) {
    const inputs = new Map<string, WorldInput>();
    for (const player of players) {
      // Às vezes o jogador fica sem input no tick.
      if (random() < 0.1) continue;
      inputs.set(player.playerId, {
        input: {
          moveX: axes[Math.floor(random() * 3)] ?? 0,
          moveY: axes[Math.floor(random() * 3)] ?? 0,
          aimAngle: random() * Math.PI * 2 - Math.PI,
          moveMode: MOVE_MODES[Math.floor(random() * MOVE_MODES.length)] ?? 'walk',
          fire: random() < 0.6,
          reload: random() < 0.02,
          weaponSlot: random() < 0.9 ? 'primary' : 'secondary',
        },
        repeated: random() < 0.05,
      });
    }
    sequence.push(inputs);
  }
  return sequence;
}

function run(
  sequence: readonly Inputs[],
  seed: number,
  start: SimWorld = createWorld(map, players),
) {
  let world = start;
  let shots = 0;
  let hits = 0;
  let kills = 0;
  const angles: number[] = [];
  for (const inputs of sequence) {
    const result = stepWorld(world, inputs, { seed });
    world = result.world;
    shots += result.shots.length;
    hits += result.shots.filter((shot) => shot.hit !== null).length;
    kills += result.shots.filter((shot) => shot.hit?.killed === true).length;
    angles.push(...result.shots.map((shot) => shot.angle));
  }
  return { world, shots, hits, kills, angles };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('determinismo', () => {
  it('1000 ticks com movimento e tiros, mesma seed, mesmo estado final', () => {
    const first = run(inputSequence(2026), 77);
    const second = run(inputSequence(2026), 77);
    expect(first.world.tick).toBe(1000);
    expect(second.world.players).toEqual(first.world.players);
    expect(second.shots).toBe(first.shots);
    // Os jogadores se mexeram e atiraram de verdade.
    expect(first.world.players.map((p) => [p.x, p.y])).not.toEqual(players.map((p) => [p.x, p.y]));
    expect(first.shots).toBeGreaterThan(100);
  });

  it('outra seed muda o desvio dos tiros', () => {
    const sequence = inputSequence(5);
    const first = run(sequence, 1);
    const second = run(sequence, 2);
    expect(second.shots).toBe(first.shots);
    expect(first.shots).toBeGreaterThan(0);
    expect(second.angles).not.toEqual(first.angles);
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
    expect(() => run(sequence, 3)).not.toThrow();
  });

  it('não altera o mundo recebido', () => {
    const world = createWorld(map, players);
    const before = world.players.map((player) => ({ ...player }));
    stepWorld(world, inputSequence(1)[0] ?? new Map(), { seed: 1 });
    expect(world.players).toEqual(before);
    expect(world.tick).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Tiros, dano, morte e renascimento
// ---------------------------------------------------------------------------

const arena = openMap(240, 120);

function fire(overrides: Partial<PlayerInput> = {}): WorldInput {
  return { input: testInput({ fire: true, ...overrides }) };
}

function step(world: SimWorld, inputs: Record<string, WorldInput>, options: WorldStepOptions = {}) {
  return stepWorld(world, new Map(Object.entries(inputs)), options);
}

function get(world: SimWorld, playerId: string): PlayerSimState {
  const found = world.players.find((player) => player.playerId === playerId);
  if (found === undefined) throw new Error(`sem ${playerId}`);
  return found;
}

/** Atirador `a` em (100, 400) mirando para o leste e o alvo `b` a `distance` px. */
function duel(distance: number, targetTeam: 0 | 1 = 1, health = 100): SimWorld {
  return createWorld(arena, [
    testPlayer('a', 100, 400, { team: 0 }),
    testPlayer('b', 100 + distance, 400, { team: targetTeam, health }),
  ]);
}

/** Dispara um tiro de `a` (o primeiro da arma, sem recuo nem desvio) e devolve o resultado. */
function oneShot(world: SimWorld, weaponSlot: 'primary' | 'secondary' = 'primary') {
  const start =
    weaponSlot === 'primary'
      ? world
      : {
          ...world,
          players: world.players.map((player) => ({
            ...player,
            weapon: { ...player.weapon, activeSlot: 'secondary' as const },
          })),
        };
  return step(start, { a: fire({ weaponSlot }) });
}

describe('acerto e dano', () => {
  it('M4A1 tira 32 dentro do alcance e mata em 4 acertos dentro de 480 px', () => {
    let world = duel(480);
    const damages: number[] = [];
    for (let tick = 0; tick < 20 && get(world, 'b').alive; tick += 1) {
      // Cadência real da arma, com recuo zerado a cada tiro para o raio não sair do alvo.
      const result = step(
        {
          ...world,
          players: world.players.map((player) =>
            player.playerId === 'a'
              ? { ...player, weapon: { ...player.weapon, recoilDeg: 0, bloomDeg: 0 } }
              : player,
          ),
        },
        { a: fire() },
      );
      world = result.world;
      for (const shot of result.shots) {
        if (shot.hit !== null) damages.push(shot.hit.damage);
      }
    }
    expect(damages).toEqual([32, 32, 32, 32]);
    expect(get(world, 'b')).toMatchObject({ alive: false, health: 0 });
  });

  it('a 960 px ou mais, cada acerto da M4A1 tira 19 (60% de 32, arredondado)', () => {
    for (const distance of [960, 1200]) {
      const { shots } = oneShot(duel(distance));
      expect(shots[0]?.hit?.damage).toBe(19);
    }
  });

  it('queda linear entre rangePx e 2 × rangePx', () => {
    // M4A1: 480 px de alcance. Em 720 px (meio da queda), 80% de 32 = 25,6 -> 26.
    expect(oneShot(duel(720)).shots[0]?.hit?.damage).toBe(26);
    // M9: 280 px de alcance, 30 de dano. Em 420 px, 80% de 30 = 24.
    expect(oneShot(duel(420), 'secondary').shots[0]?.hit?.damage).toBe(24);
  });

  it('fogo amigo tira 50%, arredondado', () => {
    const { shots, world } = oneShot(duel(300, 0));
    expect(shots[0]?.hit).toMatchObject({ targetId: 'b', damage: 16, friendly: true });
    expect(get(world, 'b').health).toBe(84);
  });

  it('morte com a vida em 0: alive falso e renascimento marcado', () => {
    const { shots, world } = oneShot(duel(300, 1, 32));
    expect(shots[0]?.hit).toMatchObject({ damage: 32, killed: true });
    expect(get(world, 'b')).toMatchObject({
      alive: false,
      health: 0,
      respawnAtTick: 1 + RESPAWN_TICKS,
    });
  });

  it('acerto que não zera a vida não mata', () => {
    const { shots, world } = oneShot(duel(300, 1, 33));
    expect(shots[0]?.hit?.killed).toBe(false);
    expect(get(world, 'b')).toMatchObject({ alive: true, health: 1 });
  });

  it('morte simultânea: dois jogadores se matam no mesmo tick', () => {
    const world = createWorld(arena, [
      testPlayer('a', 100, 400, { team: 0, health: 10 }),
      testPlayer('b', 400, 400, { team: 1, health: 10, aimAngle: Math.PI }),
    ]);
    const result = step(world, { a: fire(), b: fire({ aimAngle: Math.PI }) });
    expect(result.shots.map((shot) => [shot.shooterId, shot.hit?.killed])).toEqual([
      ['a', true],
      ['b', true],
    ]);
    expect(get(result.world, 'a').alive).toBe(false);
    expect(get(result.world, 'b').alive).toBe(false);
  });

  it('dois tiros no mesmo alvo: o primeiro na ordem de playerId mata, o segundo só acerta', () => {
    const world = createWorld(arena, [
      testPlayer('x', 100, 380, { team: 0 }),
      testPlayer('w', 100, 420, { team: 0 }),
      testPlayer('alvo', 400, 400, { team: 1, health: 20 }),
    ]);
    const aimX = Math.atan2(20, 300);
    const aimW = Math.atan2(-20, 300);
    const result = step(world, { x: fire({ aimAngle: aimX }), w: fire({ aimAngle: aimW }) });
    expect(result.shots.map((shot) => [shot.shooterId, shot.hit?.killed])).toEqual([
      ['w', true],
      ['x', false],
    ]);
  });

  it('o corpo não bloqueia o tiro: o raio passa pelo morto e acerta quem está atrás', () => {
    const world = createWorld(arena, [
      testPlayer('a', 100, 400, { team: 0 }),
      testPlayer('morto', 200, 400, { team: 1, alive: false, health: 0, respawnAtTick: 999 }),
      testPlayer('vivo', 400, 400, { team: 1 }),
    ]);
    expect(step(world, { a: fire() }).shots[0]?.hit?.targetId).toBe('vivo');
  });

  it('parede entre atirador e alvo bloqueia o tiro', () => {
    const walled = mapWithWalls(240, 120, (cx) => cx === 30);
    const world = createWorld(walled, [
      testPlayer('a', 100, 400, { team: 0 }),
      testPlayer('b', 400, 400, { team: 1 }),
    ]);
    const { shots } = step(world, { a: fire() });
    expect(shots[0]?.hit).toBeNull();
    expect(shots[0]?.end.x).toBeCloseTo(240, 6);
  });

  it('quem corre não atira', () => {
    const world = duel(300);
    const { shots } = step(world, { a: fire({ moveMode: 'run', moveY: 1 }) });
    expect(shots).toEqual([]);
  });

  it('morto não move, não atira e não recarrega, mas o tick passa', () => {
    const dead = testPlayer('a', 100, 400, { alive: false, health: 0, respawnAtTick: 50 });
    const world = createWorld(arena, [dead]);
    const result = step(world, { a: fire({ moveX: 1, reload: true }) });
    expect(result.shots).toEqual([]);
    expect(get(result.world, 'a')).toEqual(dead);
  });

  it('vida infinita: o dano é calculado e confirmado, mas não desconta vida', () => {
    const { shots, world } = step(
      duel(300, 1, 10),
      { a: fire() },
      {
        isInvulnerable: (id) => id === 'b',
      },
    );
    expect(shots[0]?.hit).toMatchObject({ targetId: 'b', damage: 32, killed: false });
    expect(get(world, 'b')).toMatchObject({ alive: true, health: 10 });
  });

  it('com targetsForShot, o tiro mede o alvo onde o servidor disser', () => {
    // O alvo está em (400, 400) agora, mas para este tiro estava em (400, 300).
    const moved = (shot: { shooterId: string }, current: readonly ShotTarget[]) =>
      current.map((target) => ({ ...target, y: 300 }));
    const atPast = step(
      duel(300),
      { a: fire({ aimAngle: Math.atan2(-100, 300) }) },
      {
        targetsForShot: moved,
      },
    );
    expect(atPast.shots[0]?.hit?.targetId).toBe('b');
    const atNow = step(duel(300), { a: fire({ aimAngle: Math.atan2(-100, 300) }) });
    expect(atNow.shots[0]?.hit).toBeNull();
  });

  it('alvo fora da lista de targetsForShot (morto naquele instante) não é atingido', () => {
    const { shots } = step(duel(300), { a: fire() }, { targetsForShot: () => [] });
    expect(shots[0]?.hit).toBeNull();
  });
});

describe('renascimento', () => {
  it('depois de 3 s volta ao spawn com vida e pentes cheios, recuo e dispersão zerados', () => {
    const spawn = { x: 50, y: 60 };
    let world = createWorld(
      arena,
      [testPlayer('a', 100, 400, { team: 0 }), testPlayer('b', 300, 400, { team: 1, health: 10 })],
      new Map([
        ['a', { x: 100, y: 400 }],
        ['b', spawn],
      ]),
    );
    // b atira (gasta munição e acumula recuo) e morre no mesmo tick.
    const killTick = step(world, { a: fire(), b: fire({ aimAngle: -Math.PI / 2 }) });
    world = killTick.world;
    const dead = get(world, 'b');
    expect(dead.alive).toBe(false);
    expect(dead.weapon.ammo.primary).toBe(29);
    expect(dead.weapon.recoilDeg).not.toBe(0);
    expect(RESPAWN_TICKS * TICK_MS).toBeCloseTo(COMBAT_CONFIG.respawnDelayMs, 6);

    for (let tick = 1; tick < RESPAWN_TICKS; tick += 1) {
      world = step(world, { b: fire({ moveX: 1 }) }).world;
      expect(get(world, 'b')).toEqual(dead);
    }
    const back = step(world, {});
    expect(back.respawned).toEqual(['b']);
    const reborn = get(back.world, 'b');
    expect(reborn).toMatchObject({ ...spawn, alive: true, health: 100, respawnAtTick: null });
    expect(reborn.weapon).toMatchObject({
      ammo: { primary: 30, secondary: 15 },
      recoilDeg: 0,
      bloomDeg: 0,
      reloadLeftMs: 0,
      switchLeftMs: 0,
      shotCount: dead.weapon.shotCount,
    });
  });
});
