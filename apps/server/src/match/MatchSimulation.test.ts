import { level0Brain } from '@rainbow-pixel/bots';
import { createCollisionGrid, getMap, patrolWaypoints } from '@rainbow-pixel/maps';
import {
  BOT_LEVEL0_CONFIG,
  NET_CONFIG,
  SIM_CONFIG,
  TICK_MS,
  circleOverlapsSolid,
  hasLineOfSight,
} from '@rainbow-pixel/shared';
import type { InputCommand, PlayerSimState } from '@rainbow-pixel/shared';
import { describe, expect, it } from 'vitest';
import { MatchSimulation } from './MatchSimulation.js';
import type { MatchPlayerSetup } from './MatchSimulation.js';

const map = getMap('gym_01');
const START = 1_000_000;

/** 1 humano e 3 bots, como no critério de aceite 6 do marco 0.2. */
const ONE_HUMAN_THREE_BOTS: readonly MatchPlayerSetup[] = [
  { playerId: 'ana', team: 0, kind: 'human' },
  { playerId: 'bot:1', team: 1, kind: 'bot', botDifficulty: 'easy' },
  { playerId: 'bot:2', team: 0, kind: 'bot', botDifficulty: 'medium' },
  { playerId: 'bot:3', team: 1, kind: 'bot', botDifficulty: 'hard' },
];

function create(players: readonly MatchPlayerSetup[] = ONE_HUMAN_THREE_BOTS) {
  return new MatchSimulation({ map, players, startMs: START, seed: 7 });
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

/** Por padrão, W mirando para o leste: anda para o leste. */
function input(seq: number, overrides: Partial<InputCommand> = {}): InputCommand {
  return {
    seq,
    moveX: 0,
    moveY: -1,
    aimAngle: 0,
    moveMode: 'walk',
    fire: false,
    reload: false,
    weaponSlot: 'primary',
    viewTimeMs: START,
    ...overrides,
  };
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
    // S mirando para o leste: anda de costas, para o oeste.
    sim.enqueueInputs('ana', [input(1, { moveY: 1 })], at(1));
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
  it('1 humano e 3 bots: os bots patrulham o circuito por 5 minutos sem ficar parados mais de 5 s', () => {
    // O nível 0 (patrulha) é a base do nível 1 quando não há inimigo à vista. Aqui ele roda
    // sozinho, para os bots dos dois times não pararem para trocar tiro.
    const sim = new MatchSimulation({
      map,
      players: ONE_HUMAN_THREE_BOTS,
      startMs: START,
      seed: 7,
      botBrain: level0Brain,
    });
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

describe('MatchSimulation: bots nível 1 no gym_01', () => {
  it('1 humano com god e 3 bots por 5 minutos: atiram nele à vista, nunca através de parede, e voltam a patrulhar', () => {
    const sim = create();
    sim.setGod('ana', true);
    const grid = createCollisionGrid(map);
    const waypoints = patrolWaypoints(map);
    const botIds = ['bot:1', 'bot:2', 'bot:3'];
    // A ana alterna a cada 15 s entre um waypoint do circuito (à vista de quem passa) e um
    // canto do pátio oeste, fora do prédio e longe das portas.
    const exposed = waypoints[4] ?? { x: 1040, y: 400 };
    const hidden = { x: 40, y: 760 };
    const phaseTicks = SIM_CONFIG.tickRate * 15;
    let hitsOnAna = 0;
    let botShots = 0;
    const walkedWhileHidden = new Map(botIds.map((id) => [id, 0]));
    let previous = new Map(sim.players.map((item) => [item.playerId, item]));

    for (let tick = 1; tick <= SIM_CONFIG.tickRate * 60 * 5; tick += 1) {
      const phaseTick = (tick - 1) % phaseTicks;
      const isExposed = Math.floor((tick - 1) / phaseTicks) % 2 === 0;
      if (phaseTick === 0) {
        const spot = isExposed ? exposed : hidden;
        expect(sim.teleport('ana', spot.x, spot.y)).toBe(true);
      }
      sim.advance(at(tick));
      // O bot vê o estado do começo do tick (o viewTimeMs dele), e a compensação de lag avalia
      // o tiro ali: no tick do teleporte, quem atira ainda vê a ana no ponto antigo.
      const seenAna = previous.get('ana') ?? player(sim, 'ana');
      for (const event of sim.snapshotFor('ana', () => true).events) {
        if (event.tick !== sim.tick) continue;
        if (event.kind === 'damage_taken') {
          hitsOnAna += 1;
          // Só leva tiro à vista, e quem acertou tinha a linha livre até onde a via.
          expect(seenAna).not.toMatchObject(hidden);
          expect(hasLineOfSight(grid, event.origin, seenAna)).toBe(true);
        }
        if (event.kind === 'shot') {
          botShots += 1;
          // O raio para na face da primeira parede: o trecho até logo antes do fim é livre.
          const length = Math.hypot(event.end.x - event.origin.x, event.end.y - event.origin.y);
          const back = length === 0 ? 0 : 0.01 / length;
          const beforeEnd = {
            x: event.end.x - (event.end.x - event.origin.x) * back,
            y: event.end.y - (event.end.y - event.origin.y) * back,
          };
          expect(hasLineOfSight(grid, event.origin, beforeEnd)).toBe(true);
        }
      }
      for (const id of botIds) {
        const bot = player(sim, id);
        expect(circleOverlapsSolid(grid, bot.x, bot.y, SIM_CONFIG.playerRadius)).toBe(false);
        const before = previous.get(id);
        if (!isExposed && before !== undefined && before.alive && bot.alive) {
          const step = Math.hypot(bot.x - before.x, bot.y - before.y);
          walkedWhileHidden.set(id, (walkedWhileHidden.get(id) ?? 0) + step);
        }
      }
      previous = new Map(sim.players.map((item) => [item.playerId, item]));
    }
    expect(botShots).toBeGreaterThan(0);
    expect(hitsOnAna).toBeGreaterThan(0);
    // Sem a ana à vista, os bots voltam a andar: bem mais que uma volta no circuito, somando as
    // fases em que ela some.
    for (const id of botIds) {
      expect(walkedWhileHidden.get(id) ?? 0).toBeGreaterThan(2000);
    }
    expect(player(sim, 'ana')).toMatchObject({ alive: true, health: 100 });
  });
});
