import { createCollisionGrid, getMap, patrolWaypoints } from '@rainbow-pixel/maps';
import {
  BOT_LEVEL0_CONFIG,
  NET_CONFIG,
  SIM_CONFIG,
  TICK_MS,
  circleOverlapsSolid,
} from '@rainbow-pixel/shared';
import type { InputCommand, PlayerSimState } from '@rainbow-pixel/shared';
import { describe, expect, it } from 'vitest';
import { buildBotView } from './BotController.js';
import { MatchSimulation } from './MatchSimulation.js';
import type { MatchPlayerSetup } from './MatchSimulation.js';

const map = getMap('gym_01');
const START = 1_000_000;

/** 1 humano e 3 bots, como no critério de aceite 6. */
const ONE_HUMAN_THREE_BOTS: readonly MatchPlayerSetup[] = [
  { playerId: 'ana', team: 0, kind: 'human' },
  { playerId: 'bot:1', team: 1, kind: 'bot' },
  { playerId: 'bot:2', team: 0, kind: 'bot' },
  { playerId: 'bot:3', team: 1, kind: 'bot' },
];

function create(players: readonly MatchPlayerSetup[] = ONE_HUMAN_THREE_BOTS) {
  return new MatchSimulation({ map, players, startMs: START });
}

function player(sim: MatchSimulation, playerId: string): PlayerSimState {
  const found = sim.players.find((item) => item.playerId === playerId);
  if (found === undefined) throw new Error(`sem jogador ${playerId}`);
  return found;
}

/** Tempo, em ms, do fim do tick `tick`. */
function at(tick: number): number {
  return START + tick * TICK_MS + 0.01;
}

function input(seq: number, overrides: Partial<InputCommand> = {}): InputCommand {
  return { seq, moveX: 1, moveY: 0, aimAngle: 0, moveMode: 'walk', ...overrides };
}

describe('MatchSimulation: tick fixo', () => {
  it('roda 30 ticks por segundo, pelo acumulador', () => {
    const sim = create();
    expect(sim.advance(START + 10).ticks).toBe(0);
    expect(sim.advance(START + 40).ticks).toBe(1);
    expect(sim.advance(START + 1000).ticks).toBe(SIM_CONFIG.tickRate - 1);
    expect(sim.tick).toBe(SIM_CONFIG.tickRate);
    expect(sim.serverTimeMs).toBeCloseTo(START + 1000, 6);
  });

  it('manda snapshots a 20 Hz, o primeiro logo no primeiro tick', () => {
    const sim = create();
    expect(sim.advance(at(1)).snapshotDue).toBe(true);
    let snapshots = 0;
    for (let tick = 2; tick <= 1 + SIM_CONFIG.tickRate * 3; tick += 1) {
      if (sim.advance(at(tick)).snapshotDue) snapshots += 1;
    }
    expect(snapshots).toBe(NET_CONFIG.snapshotRate * 3);
  });

  it('depois de muito tempo parado, recupera no máximo maxCatchUpTicks', () => {
    const sim = create();
    expect(sim.advance(START + 60_000).ticks).toBe(SIM_CONFIG.maxCatchUpTicks);
    expect(sim.advance(START + 60_000 + TICK_MS).ticks).toBe(1);
  });
});

describe('MatchSimulation: inputs dos humanos', () => {
  it('move o jogador e confirma o seq no snapshot', () => {
    const sim = create();
    const start = player(sim, 'ana');
    for (let tick = 1; tick <= 30; tick += 1) {
      sim.enqueueInputs('ana', [input(tick)], at(tick - 1));
      sim.advance(at(tick));
    }
    expect(player(sim, 'ana').x - start.x).toBeCloseTo(140, 6);
    const snapshot = sim.snapshotFor('ana', () => true);
    expect(snapshot.ackSeq).toBe(30);
    expect(snapshot.tick).toBe(30);
    expect(snapshot.players.map((item) => item.playerId)).toEqual([
      'ana',
      'bot:1',
      'bot:2',
      'bot:3',
    ]);
  });

  it('um cliente que manda 120 inputs por segundo não anda mais que um cliente normal', () => {
    const sim = create([
      { playerId: 'normal', team: 0, kind: 'human' },
      { playerId: 'rapido', team: 0, kind: 'human' },
    ]);
    const before = { normal: player(sim, 'normal'), rapido: player(sim, 'rapido') };
    let normalSeq = 0;
    let fastSeq = 0;
    const seconds = 4;
    for (let tick = 1; tick <= SIM_CONFIG.tickRate * seconds; tick += 1) {
      const now = at(tick - 1);
      normalSeq += 1;
      sim.enqueueInputs('normal', [input(normalSeq, { moveY: 1 })], now);
      // 4 mensagens por tick: 120 por segundo, todas correndo.
      for (let burst = 0; burst < 4; burst += 1) {
        fastSeq += 1;
        sim.enqueueInputs('rapido', [input(fastSeq, { moveY: 1, moveMode: 'run' })], now + burst);
      }
      sim.advance(at(tick));
    }
    const walked = (id: 'normal' | 'rapido') =>
      Math.hypot(player(sim, id).x - before[id].x, player(sim, id).y - before[id].y);
    // O rápido corre (200 px/s), o normal anda (140 px/s): nenhum passa do próprio limite.
    expect(walked('normal')).toBeLessThanOrEqual(140 * seconds + 1e-6);
    expect(walked('rapido')).toBeLessThanOrEqual(200 * seconds + 1e-6);
  });

  it('o mesmo modo, com 4x mais inputs, anda a mesma distância', () => {
    const sim = create([
      { playerId: 'normal', team: 0, kind: 'human' },
      { playerId: 'rapido', team: 0, kind: 'human' },
    ]);
    const start = { normal: player(sim, 'normal').x, rapido: player(sim, 'rapido').x };
    let fastSeq = 0;
    for (let tick = 1; tick <= 45; tick += 1) {
      sim.enqueueInputs('normal', [input(tick)], at(tick - 1));
      for (let burst = 0; burst < 4; burst += 1) {
        fastSeq += 1;
        sim.enqueueInputs('rapido', [input(fastSeq)], at(tick - 1) + burst);
      }
      sim.advance(at(tick));
    }
    const normal = player(sim, 'normal').x - start.normal;
    const fast = player(sim, 'rapido').x - start.rapido;
    expect(normal).toBeGreaterThan(0);
    expect(fast).toBeLessThanOrEqual(normal + 1e-6);
  });

  it('o snapshot traz o time de cada jogador, sem depender do lobby', () => {
    const snapshot = create().snapshotFor('ana', () => true);
    expect(snapshot.players.map((item) => [item.playerId, item.team])).toEqual([
      ['ana', 0],
      ['bot:1', 1],
      ['bot:2', 0],
      ['bot:3', 1],
    ]);
  });

  it('a vaga retomada por outra aba mantém o time no snapshot', () => {
    const sim = create();
    sim.renamePlayer('bot:1', 'nova');
    const snapshot = sim.snapshotFor('nova', () => true);
    expect(snapshot.players.find((item) => item.playerId === 'nova')?.team).toBe(1);
  });

  it('ignora input de jogador que não está na partida', () => {
    expect(create().enqueueInputs('estranho', [input(1)], START)).toBeNull();
  });
});

describe('MatchSimulation: conexão', () => {
  it('jogador desconectado para na hora, fica no lugar e mantém a entidade', () => {
    const sim = create();
    for (let tick = 1; tick <= 3; tick += 1) {
      sim.enqueueInputs('ana', [input(tick), input(tick + 100)], at(tick - 1));
    }
    sim.advance(at(1));
    sim.setConnected('ana', false);
    const stopped = player(sim, 'ana');
    sim.advance(at(60));
    expect(player(sim, 'ana')).toEqual(stopped);
    expect(sim.snapshotFor('bot:1', (id) => id !== 'ana').players[0]).toMatchObject({
      playerId: 'ana',
      connected: false,
    });
  });

  it('ao reconectar, a fila recomeça e o cliente novo controla a mesma entidade', () => {
    const sim = create();
    sim.enqueueInputs('ana', [input(50)], at(0));
    sim.advance(at(1));
    sim.setConnected('ana', false);
    sim.setConnected('ana', true);
    const position = player(sim, 'ana');
    expect(sim.snapshotFor('ana', () => true).ackSeq).toBe(0);
    sim.enqueueInputs('ana', [input(1, { moveX: -1 })], at(1));
    sim.advance(at(2));
    expect(player(sim, 'ana').x).toBeLessThan(position.x);
  });

  it('a vaga retomada por outra aba mantém a posição com o id novo', () => {
    const sim = create();
    sim.enqueueInputs('ana', [input(1)], at(0));
    sim.advance(at(5));
    const before = player(sim, 'ana');
    sim.renamePlayer('ana', 'ana-nova-aba');
    expect(sim.hasPlayer('ana')).toBe(false);
    expect(player(sim, 'ana-nova-aba')).toEqual({ ...before, playerId: 'ana-nova-aba' });
  });

  it('jogador que sai de vez some da partida', () => {
    const sim = create();
    sim.removePlayer('ana');
    expect(sim.players.map((item) => item.playerId)).toEqual(['bot:1', 'bot:2', 'bot:3']);
  });
});

describe('MatchSimulation: bots nível 0 no gym_01', () => {
  it('a visão do bot tem só ele mesmo e os waypoints públicos do mapa', () => {
    const sim = create();
    const view = buildBotView(
      { map: createCollisionGrid(map), tick: 7, players: sim.players },
      'bot:1',
      map.id,
      patrolWaypoints(map),
    );
    expect(view).toEqual({
      tick: 7,
      self: { ...player(sim, 'bot:1'), moveMode: undefined, playerId: 'bot:1' },
      mapId: 'gym_01',
      waypoints: patrolWaypoints(map),
    });
    expect(JSON.stringify(view)).not.toContain('ana');
  });

  it('1 humano e 3 bots: os bots patrulham o circuito por 5 minutos sem ficar parados mais de 5 s', () => {
    const sim = create();
    const grid = createCollisionGrid(map);
    const waypoints = patrolWaypoints(map);
    const botIds = ['bot:1', 'bot:2', 'bot:3'];
    const stillTicks = new Map(botIds.map((id) => [id, 0]));
    const longestStill = new Map(botIds.map((id) => [id, 0]));
    const visited = new Map(botIds.map((id) => [id, new Set<number>()]));
    const arrivals = new Map(botIds.map((id) => [id, 0]));
    const near = new Map<string, number | null>(botIds.map((id) => [id, null]));
    let previous = new Map(sim.players.map((item) => [item.playerId, item]));

    const totalTicks = SIM_CONFIG.tickRate * 60 * 5;
    for (let tick = 1; tick <= totalTicks; tick += 1) {
      sim.advance(at(tick));
      for (const id of botIds) {
        const now = player(sim, id);
        const before = previous.get(id);
        const moved = before === undefined ? 0 : Math.hypot(now.x - before.x, now.y - before.y);
        const still = moved < 1e-9 ? (stillTicks.get(id) ?? 0) + 1 : 0;
        stillTicks.set(id, still);
        longestStill.set(id, Math.max(longestStill.get(id) ?? 0, still));
        expect(circleOverlapsSolid(grid, now.x, now.y, SIM_CONFIG.playerRadius)).toBe(false);

        const index = waypoints.findIndex(
          (point) =>
            Math.hypot(point.x - now.x, point.y - now.y) <= BOT_LEVEL0_CONFIG.arriveRadiusPx,
        );
        if (index >= 0 && near.get(id) !== index) {
          visited.get(id)?.add(index);
          arrivals.set(id, (arrivals.get(id) ?? 0) + 1);
        }
        near.set(id, index >= 0 ? index : null);
      }
      previous = new Map(sim.players.map((item) => [item.playerId, item]));
    }

    for (const id of botIds) {
      // Nunca ficam parados 5 s (só a pausa de 1 s em cada waypoint).
      expect(longestStill.get(id) ?? 0).toBeLessThan(SIM_CONFIG.tickRate * 5);
      // Passaram por todos os waypoints, muitas voltas.
      expect(visited.get(id)?.size).toBe(waypoints.length);
      expect(arrivals.get(id) ?? 0).toBeGreaterThan(waypoints.length * 8);
    }
    // O humano sem input fica no spawn.
    const spawn = map.objects.spawnAttack[0];
    expect(player(sim, 'ana')).toMatchObject({ x: spawn?.x, y: spawn?.y });
  });
});
