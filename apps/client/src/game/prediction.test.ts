import { AIM_NORTH, NET_CONFIG, TICK_MS, createPlayerState } from '@rainbow-pixel/shared';
import type { InputCommand, PlayerSimState } from '@rainbow-pixel/shared';
import { describe, expect, it } from 'vitest';
import { Predictor } from './prediction.js';
import type { Correction } from './prediction.js';
import { FakeServer, openMap } from './testing/fakeServer.js';

const START: PlayerSimState = createPlayerState({ playerId: 'eu', team: 0, x: 1000, y: 1000 });

/** Anda em quadrado: 20 ticks para cada lado. Mirando para o norte, o WASD segue o mundo. */
function squareInput(seq: number): InputCommand {
  const side = Math.floor((seq - 1) / 20) % 4;
  const [moveX, moveY] = (
    [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
    ] as const
  )[side] ?? [0, 0];
  return {
    seq,
    moveX,
    moveY,
    aimAngle: AIM_NORTH,
    moveMode: 'walk',
    fire: false,
    reload: false,
    weaponSlot: 'primary',
    viewTimeMs: 0,
  };
}

interface Run {
  readonly predictor: Predictor;
  readonly server: FakeServer;
  readonly corrections: Correction[];
  readonly replayed: number[];
}

/**
 * Cliente e servidor por `ticks` ticks, com atraso de ida e de volta em ticks.
 * O snapshot sai a cada `snapshotEvery` ticks.
 */
function run(ticks: number, upTicks: number, downTicks: number, server?: FakeServer): Run {
  const predictor = new Predictor(openMap, 'eu');
  const fake = server ?? new FakeServer(START, upTicks);
  const corrections: Correction[] = [];
  const replayed: number[] = [];
  const inFlight: { atTick: number; ackSeq: number; state: PlayerSimState }[] = [];
  predictor.reconcile(START, 0, 0);
  for (let tick = 0; tick < ticks; tick += 1) {
    const input = squareInput(tick + 1);
    predictor.applyInput(input);
    fake.receive(input);
    fake.step();
    if (tick % 2 === 0) {
      inFlight.push({ atTick: tick + downTicks, ackSeq: fake.ackSeq, state: fake.state });
    }
    while ((inFlight[0]?.atTick ?? Infinity) <= tick) {
      const snapshot = inFlight.shift();
      if (snapshot === undefined) break;
      const correction = predictor.reconcile(snapshot.state, snapshot.ackSeq, tick * TICK_MS);
      replayed.push(predictor.pendingInputs.length);
      if (correction !== null && correction.errorPx > 1e-9) corrections.push(correction);
    }
  }
  return { predictor, server: fake, corrections, replayed };
}

describe('Predictor', () => {
  it('sem snapshot ainda, guarda os inputs e aplica todos quando o primeiro chega', () => {
    const predictor = new Predictor(openMap, 'eu');
    for (let seq = 1; seq <= 5; seq += 1) predictor.applyInput(squareInput(seq));
    expect(predictor.predicted).toBeNull();
    expect(predictor.reconcile(START, 2, 0)).toBeNull();
    expect(predictor.pendingInputs.map((input) => input.seq)).toEqual([3, 4, 5]);
    expect(predictor.predicted?.x).toBeCloseTo(START.x + 3 * (140 / 30), 9);
  });

  it('com atraso simulado, converge para a posição do servidor sem nenhuma correção', () => {
    // 150 ms de ida e 150 ms de volta, a 30 Hz.
    const { predictor, server, corrections } = run(600, 5, 5);
    expect(corrections).toEqual([]);
    // O servidor alcança a previsão quando processa os últimos inputs.
    const final = predictor.predicted;
    for (let tick = 0; tick < 20; tick += 1) {
      server.step();
    }
    expect(final?.x).toBeCloseTo(server.state.x, 9);
    expect(final?.y).toBeCloseTo(server.state.y, 9);
  });

  it('reaplica só os inputs com seq maior que o ackSeq', () => {
    const { replayed, predictor, server } = run(120, 5, 5);
    // Com 10 ticks de ida e volta, ficam ~10 inputs pendentes depois de cada snapshot.
    expect(Math.max(...replayed)).toBeLessThanOrEqual(12);
    expect(Math.min(...replayed.slice(5))).toBeGreaterThanOrEqual(8);
    expect(predictor.pendingInputs.every((input) => input.seq > server.ackSeq - 10)).toBe(true);
  });

  it('quando o servidor repete um input, corrige um passo e volta a bater', () => {
    const server = new FakeServer(START, 5);
    server.repeatOnTicks.add(50);
    const { corrections, predictor } = run(300, 5, 5, server);
    expect(corrections).toHaveLength(1);
    expect(corrections[0]?.errorPx).toBeCloseTo(140 / 30, 6);
    expect(corrections[0]?.snapped).toBe(false);
    for (let tick = 0; tick < 20; tick += 1) server.step();
    expect(predictor.predicted?.x).toBeCloseTo(server.state.x, 9);
  });

  it('erro abaixo de 32 px é corrigido suavemente em 100 ms', () => {
    const predictor = new Predictor(openMap, 'eu');
    predictor.reconcile(START, 0, 0);
    const correction = predictor.reconcile({ ...START, x: START.x + 20 }, 0, 1000);
    expect(correction).toEqual({ errorPx: 20, snapped: false });
    expect(predictor.displayPosition(1000).x).toBeCloseTo(START.x, 9);
    expect(predictor.displayPosition(1050).x).toBeCloseTo(START.x + 10, 9);
    expect(predictor.displayPosition(1000 + NET_CONFIG.reconciliationSmoothingMs).x).toBeCloseTo(
      START.x + 20,
      9,
    );
  });

  it('erro de 32 px ou mais é corrigido na hora', () => {
    const predictor = new Predictor(openMap, 'eu');
    predictor.reconcile(START, 0, 0);
    const correction = predictor.reconcile({ ...START, x: START.x + 40 }, 0, 1000);
    expect(correction).toEqual({ errorPx: 40, snapped: true });
    expect(predictor.displayPosition(1000).x).toBe(START.x + 40);
  });

  it('esquece os pendentes quando a fila do servidor recomeça', () => {
    const predictor = new Predictor(openMap, 'eu');
    predictor.applyInput(squareInput(1));
    predictor.clearPending();
    expect(predictor.pendingInputs).toEqual([]);
  });
});
