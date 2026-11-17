// Integração do combate na partida (marco 0.3): eventos por destinatário, seed fora dos
// snapshots, cadência contra cliente apressado, compensação de lag, conexão e bot nível 1.

import { BOT_DIFFICULTY_PARAMS, SIM_CONFIG, TICK_MS, getWeapon } from '@rainbow-pixel/shared';
import type {
  InputCommand,
  MatchEvent,
  PlayerSimState,
  SnapshotMessage,
} from '@rainbow-pixel/shared';
import { describe, expect, it } from 'vitest';
import { MatchSimulation } from './MatchSimulation.js';
import type { MatchPlayerSetup } from './MatchSimulation.js';
import { arenaMap, zoneAround } from './testing/arenaMap.js';

const START = 1_000_000;
const SEED = 987_654_321;

/** Arena de 960 x 480 px: time 0 nasce em (200, 240) e time 1 em (400, 240). */
function arena(walls?: (cx: number, cy: number) => boolean) {
  return arenaMap({
    width: 120,
    height: 60,
    attack: [{ x: 200, y: 240 }],
    defense: [zoneAround({ x: 400, y: 240 })],
    ...(walls === undefined ? {} : { walls }),
  });
}

const DUEL: readonly MatchPlayerSetup[] = [
  { playerId: 'atirador', team: 0, kind: 'human' },
  { playerId: 'alvo', team: 1, kind: 'human' },
];

function create(players: readonly MatchPlayerSetup[] = DUEL, map = arena()) {
  return new MatchSimulation({ map, players, startMs: START, seed: SEED });
}

/** Tempo, em ms, do fim do tick `tick`. */
function at(tick: number): number {
  return START + tick * TICK_MS + 0.01;
}

function input(seq: number, overrides: Partial<InputCommand> = {}): InputCommand {
  return {
    seq,
    moveX: 0,
    moveY: 0,
    aimAngle: 0,
    moveMode: 'walk',
    fire: false,
    reload: false,
    weaponSlot: 'primary',
    viewTimeMs: START,
    ...overrides,
  };
}

function player(sim: MatchSimulation, playerId: string): PlayerSimState {
  const found = sim.players.find((item) => item.playerId === playerId);
  if (found === undefined) throw new Error(`sem jogador ${playerId}`);
  return found;
}

function kinds(snapshot: SnapshotMessage): MatchEvent['kind'][] {
  return snapshot.events.map((event) => event.kind);
}

describe('eventos e snapshots', () => {
  it('hit_confirm só no snapshot do atirador e damage_taken só no da vítima', () => {
    const sim = create([...DUEL, { playerId: 'terceiro', team: 0, kind: 'human' }]);
    sim.teleport('terceiro', 300, 100);
    sim.enqueueInputs('atirador', [input(1, { fire: true })], at(0));
    sim.advance(at(1));
    const shooter = sim.snapshotFor('atirador', () => true);
    const victim = sim.snapshotFor('alvo', () => true);
    const other = sim.snapshotFor('terceiro', () => true);
    expect(kinds(shooter)).toEqual(['shot', 'hit_confirm']);
    expect(kinds(victim)).toEqual(['shot', 'damage_taken']);
    expect(kinds(other)).toEqual(['shot']);
    expect(shooter.events[1]).toMatchObject({
      seq: 1,
      targetId: 'alvo',
      damage: 32,
      killed: false,
    });
    expect(victim.events[1]).toMatchObject({ damage: 32, origin: { x: 200, y: 240 } });
  });

  it('os eventos se repetem nos 3 snapshots seguintes', () => {
    const sim = create();
    sim.enqueueInputs('atirador', [input(1, { fire: true })], at(0));
    sim.advance(at(1));
    const first = sim.snapshotFor('atirador', () => true).events.map((event) => event.eventId);
    const next = [1, 2, 3, 4].map(() =>
      sim.snapshotFor('atirador', () => true).events.map((event) => event.eventId),
    );
    expect(next.slice(0, 3)).toEqual([first, first, first]);
    expect(next[3]).toEqual([]);
  });

  it('nenhum snapshot traz a vida de um inimigo nem a seed da partida', () => {
    const sim = create();
    let seq = 0;
    const seen: { readonly team: number; readonly json: string }[] = [];
    for (let tick = 1; tick <= SIM_CONFIG.tickRate * 3; tick += 1) {
      seq += 1;
      sim.enqueueInputs('atirador', [input(seq, { fire: tick % 2 === 0 })], at(tick - 1));
      if (sim.advance(at(tick)).snapshotDue) {
        seen.push({ team: 0, json: JSON.stringify(sim.snapshotFor('atirador', () => true)) });
        seen.push({ team: 1, json: JSON.stringify(sim.snapshotFor('alvo', () => true)) });
      }
    }
    expect(seen.length).toBeGreaterThan(100);
    for (const { team, json } of seen) {
      expect(json).not.toContain(String(SEED));
      const snapshot = JSON.parse(json) as SnapshotMessage;
      for (const other of snapshot.players) {
        if (other.team !== team) {
          expect(other).not.toHaveProperty('health');
        }
      }
    }
    // O alvo foi atingido de verdade (a vida mudou).
    expect(player(sim, 'alvo').health).toBeLessThan(100);
  });
});

describe('cadência no servidor', () => {
  it.each([
    ['secondary', getWeapon('m9').rpm],
    ['primary', getWeapon('m4a1').rpm],
  ] as const)(
    'cliente com 120 inputs por segundo, alternando o gatilho, não passa do RPM (%s)',
    (weaponSlot, rpm) => {
      const sim = create();
      let seq = 0;
      const seconds = 10;
      for (let tick = 1; tick <= SIM_CONFIG.tickRate * seconds; tick += 1) {
        for (let burst = 0; burst < 4; burst += 1) {
          seq += 1;
          sim.enqueueInputs(
            'atirador',
            [input(seq, { weaponSlot, fire: seq % 2 === 0, aimAngle: -Math.PI / 2 })],
            at(tick - 1) + burst,
          );
        }
        sim.advance(at(tick));
      }
      const shots = player(sim, 'atirador').weapon.shotCount;
      expect(shots).toBeGreaterThan(0);
      expect(shots).toBeLessThanOrEqual((rpm / 60) * seconds + 1);
    },
  );

  it('input repetido pela fila não dispara', () => {
    const sim = create();
    sim.enqueueInputs('atirador', [input(1, { fire: true, aimAngle: -Math.PI / 2 })], at(0));
    // Sem input novo: a fila repete o último por 3 ticks, sem disparar.
    sim.advance(at(10));
    expect(player(sim, 'atirador').weapon.shotCount).toBe(1);
  });

  it('quem corre não atira', () => {
    const sim = create();
    for (let tick = 1; tick <= 30; tick += 1) {
      sim.enqueueInputs(
        'atirador',
        [input(tick, { fire: true, moveMode: 'run', moveY: 1 })],
        at(tick - 1),
      );
      sim.advance(at(tick));
    }
    expect(player(sim, 'atirador').weapon.shotCount).toBe(0);
    expect(player(sim, 'alvo').health).toBe(100);
  });
});

describe('compensação de lag na partida', () => {
  /**
   * O alvo anda para baixo a 140 px/s. No tick 30, o atirador dispara mirando onde o alvo
   * estava 175 ms antes, declarando `viewTimeMs` conforme `seen`.
   */
  function shootMovingTarget(declaredRewindMs: number): number {
    const sim = create();
    sim.teleport('atirador', 100, 240);
    sim.teleport('alvo', 400, 100);
    sim.setNoSpread('atirador', true);
    // Mira para baixo e anda para frente (W).
    const walkDown = { aimAngle: Math.PI / 2, moveY: -1 } as const;
    for (let tick = 1; tick < 30; tick += 1) {
      sim.enqueueInputs('alvo', [input(tick, walkDown)], at(tick - 1));
      sim.advance(at(tick));
    }
    // Onde o alvo estava 175 ms atrás, contados do tick 30 (o do disparo).
    const tickTime = START + 30 * TICK_MS;
    const seenY = 100 + (140 * (30 * TICK_MS - 175)) / 1000;
    const aimAngle = Math.atan2(seenY - 240, 400 - 100);
    sim.enqueueInputs('alvo', [input(30, walkDown)], at(29));
    sim.enqueueInputs(
      'atirador',
      [input(1, { fire: true, aimAngle, viewTimeMs: tickTime - declaredRewindMs })],
      tickTime - TICK_MS / 2,
    );
    sim.advance(at(30));
    return player(sim, 'alvo').health;
  }

  it('com o tempo declarado pelo cliente, o tiro no que ele via acerta', () => {
    expect(shootMovingTarget(175)).toBe(100 - 32);
  });

  it('declarando o tempo atual (sem volta), o mesmo tiro erra', () => {
    expect(shootMovingTarget(0)).toBe(100);
  });
});

describe('comandos de debug', () => {
  it('teleporte para dentro de parede é recusado; no chão, move', () => {
    const sim = create(
      [...DUEL],
      arena((cx) => cx === 60),
    );
    expect(sim.teleport('atirador', 484, 100)).toBe(false);
    expect(sim.teleport('atirador', 4, 100)).toBe(false);
    expect(sim.teleport('atirador', 600, 100)).toBe(true);
    expect(player(sim, 'atirador')).toMatchObject({ x: 600, y: 100 });
  });

  it('god: o dano é confirmado no hit_confirm, mas não desconta vida', () => {
    const sim = create();
    sim.setGod('alvo', true);
    sim.enqueueInputs('atirador', [input(1, { fire: true })], at(0));
    sim.advance(at(1));
    expect(sim.snapshotFor('atirador', () => true).events[1]).toMatchObject({
      kind: 'hit_confirm',
      damage: 32,
      killed: false,
    });
    expect(player(sim, 'alvo').health).toBe(100);
    expect(sim.snapshotFor('alvo', () => true).self?.dev).toEqual({ god: true, noSpread: false });
  });
});

describe('conexão durante o combate', () => {
  it('desconectado fica parado, vulnerável, morre e renasce; ao voltar, mantém vida e munição', () => {
    const sim = create();
    sim.setConnected('alvo', false);
    sim.setNoSpread('atirador', true);
    let seq = 0;
    let tick = 0;
    // Clique a clique (sem acumular recuo), até matar o alvo parado.
    while (player(sim, 'alvo').alive && tick < 300) {
      tick += 1;
      seq += 1;
      sim.enqueueInputs('atirador', [input(seq, { fire: tick % 20 === 1 })], at(tick - 1));
      sim.advance(at(tick));
    }
    const deathTick = tick;
    expect(player(sim, 'alvo')).toMatchObject({ alive: false, x: 400, y: 240 });
    // Parado como corpo até renascer, 3 s depois, no próprio spawn.
    for (; tick < deathTick + 89; tick += 1) {
      sim.advance(at(tick + 1));
      expect(player(sim, 'alvo').alive).toBe(false);
    }
    sim.advance(at(deathTick + 90));
    tick = deathTick + 90;
    expect(player(sim, 'alvo')).toMatchObject({ alive: true, health: 100, x: 400, y: 240 });

    // Leva um tiro, reconecta e gasta munição: continua com a mesma vida e munição. O atirador
    // declara que vê o instante atual: 200 ms atrás o alvo ainda estava morto.
    seq += 1;
    sim.enqueueInputs('atirador', [input(seq, { fire: true, viewTimeMs: at(tick) })], at(tick));
    sim.advance(at(tick + 1));
    sim.setConnected('alvo', true);
    sim.enqueueInputs('alvo', [input(1, { fire: true, aimAngle: Math.PI / 2 })], at(tick + 1));
    sim.advance(at(tick + 2));
    expect(player(sim, 'alvo')).toMatchObject({ health: 68 });
    expect(player(sim, 'alvo').weapon.ammo.primary).toBe(29);
  });
});

describe('bot nível 1 na partida', () => {
  const BOT_AND_TARGET: readonly MatchPlayerSetup[] = [
    { playerId: 'bot:1', team: 0, kind: 'bot', botDifficulty: 'medium' },
    { playerId: 'alvo', team: 1, kind: 'human' },
  ];

  it('alvo parado atrás de parede por 60 s: 0 disparos', () => {
    const sim = create(
      BOT_AND_TARGET,
      arena((cx) => cx === 37),
    );
    for (let tick = 1; tick <= SIM_CONFIG.tickRate * 60; tick += 1) {
      sim.advance(at(tick));
    }
    expect(sim.tick).toBe(SIM_CONFIG.tickRate * 60);
    expect(player(sim, 'bot:1').weapon.shotCount).toBe(0);
    expect(player(sim, 'alvo').health).toBe(100);
  });

  it('o mesmo alvo visível é atingido, e não antes do tempo de reação', () => {
    const sim = create(BOT_AND_TARGET);
    sim.setGod('alvo', true);
    let firstShotTick: number | null = null;
    let firstHitTick: number | null = null;
    for (let tick = 1; tick <= SIM_CONFIG.tickRate * 10; tick += 1) {
      sim.advance(at(tick));
      if (firstShotTick === null && player(sim, 'bot:1').weapon.shotCount > 0) {
        firstShotTick = tick;
      }
      const snapshot = sim.snapshotFor('alvo', () => true);
      if (firstHitTick === null && kinds(snapshot).includes('damage_taken')) {
        firstHitTick = tick;
      }
    }
    expect(firstShotTick).not.toBeNull();
    expect(firstHitTick).not.toBeNull();
    expect((firstShotTick ?? 0) * TICK_MS).toBeGreaterThanOrEqual(
      BOT_DIFFICULTY_PARAMS.medium.reactionMs,
    );
  });
});
