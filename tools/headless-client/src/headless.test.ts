import {
  DEV_HEADLESS_CONFIG,
  NET_CONFIG,
  SIM_CONFIG,
  TICK_MS,
  createPlayerState,
} from '@rainbow-pixel/shared';
import type { CollisionMap, PlayerSimState, SnapshotMessage } from '@rainbow-pixel/shared';
import { describe, expect, it } from 'vitest';
import type { RenderedPlayer } from '../../../apps/client/src/game/GameClient.js';
import { ArgsError, parseHeadlessArgs } from './args.js';
import { MetricsCollector } from './metrics.js';
import { SCRIPT_NAMES, createScript } from './scripts/index.js';
import type { ScriptContext } from './scripts/index.js';
import { devCommands } from './session.js';

const OPEN_MAP: CollisionMap = {
  cellSize: 8,
  width: 200,
  height: 200,
  isSolid: (cx, cy) => cx < 0 || cy < 0 || cx >= 200 || cy >= 200,
};

function context(overrides: Partial<ScriptContext> = {}): ScriptContext {
  return {
    elapsedMs: 0,
    durationMs: 60_000,
    weaponSlot: 'primary',
    fireIntervalMs: 300,
    axis: 'x',
    self: null,
    others: () => [],
    map: OPEN_MAP,
    ...overrides,
  };
}

function other(playerId: string, x: number, y: number, team: 0 | 1 = 1): RenderedPlayer {
  return { playerId, team, x, y, aimAngle: 0, connected: true, alive: true };
}

describe('parseHeadlessArgs', () => {
  it('sem argumentos: dev1 cria a sala e fica parado por 60 s', () => {
    expect(parseHeadlessArgs([])).toEqual({
      user: 'dev1',
      room: { kind: 'create', bots: 0, wait: false, humans: 1 },
      script: 'idle',
      durationSeconds: 60,
      seed: 1,
      weapon: 'primary',
      axis: 'x',
      fireIntervalMs: DEV_HEADLESS_CONFIG.defaultFireIntervalMs,
      dev: { teleport: null, god: false, noSpread: false },
      net: null,
      limits: {
        maxCorrectionsPerMinute: undefined,
        maxOtherJumpPx: undefined,
        minHitRatio: undefined,
      },
    });
  });

  it('lê os comandos do critério 2 do marco 0.3', () => {
    const target = parseHeadlessArgs([
      '--user',
      'dev2',
      '--create',
      '--humans',
      '2',
      '--script',
      'strafe',
      '--axis',
      'y',
      '--god',
      '--teleport',
      '228,400',
      '--duration',
      '90',
    ]);
    expect(target).toMatchObject({
      room: { kind: 'create', humans: 2 },
      script: 'strafe',
      axis: 'y',
      dev: { teleport: { x: 228, y: 400 }, god: true, noSpread: false },
    });
    const shooter = parseHeadlessArgs([
      '--user',
      'dev1',
      '--code',
      'ABC234',
      '--script',
      'aim-test',
      '--weapon',
      'secondary',
      '--no-spread',
      '--teleport',
      '28,400',
      '--duration',
      '60',
      '--latency',
      '75',
      '--jitter',
      '20',
      '--loss',
      '2',
      '--min-hit-ratio',
      '0.95',
      '--fire-interval-ms',
      '250',
    ]);
    expect(shooter).toMatchObject({
      script: 'aim-test',
      weapon: 'secondary',
      fireIntervalMs: 250,
      dev: { teleport: { x: 28, y: 400 }, god: false, noSpread: true },
      net: { latencyMs: 75, jitterMs: 20, lossPct: 2 },
      limits: { minHitRatio: 0.95 },
    });
  });

  it('lê o exemplo do marco', () => {
    const options = parseHeadlessArgs([
      '--user',
      'dev2',
      '--code',
      'abc234',
      '--script',
      'circle',
      '--duration',
      '60',
      '--latency',
      '150',
      '--jitter',
      '20',
      '--loss',
      '2',
      '--max-corrections-per-min',
      '6',
    ]);
    expect(options).toMatchObject({
      user: 'dev2',
      room: { kind: 'join', code: 'ABC234' },
      script: 'circle',
      net: { latencyMs: 150, jitterMs: 20, lossPct: 2 },
      limits: { maxCorrectionsPerMinute: 6 },
    });
  });

  it('cria a sala com bots', () => {
    expect(parseHeadlessArgs(['--create', '--bots', '3']).room).toEqual({
      kind: 'create',
      bots: 3,
      wait: false,
      humans: 1,
    });
  });

  it.each([
    [['--user', 'ana']],
    [['--script', 'voar']],
    [['--code', 'ABC234', '--create']],
    [['--code', 'O0O0O0']],
    [['--bots', '4']],
    [['--duration', '0']],
    [['--latency', '5000']],
    [['--loss', 'muito']],
    [['--opcao-que-nao-existe']],
    [['--weapon', 'faca']],
    [['--axis', 'z']],
    [['--teleport', '10']],
    [['--teleport', '10,abc']],
    [['--min-hit-ratio', '2']],
    [['--code', 'ABC234', '--humans', '2']],
    [['--humans', '5']],
  ])('recusa %j', (argv) => {
    expect(() => parseHeadlessArgs(argv)).toThrow(ArgsError);
  });
});

describe('roteiros', () => {
  it.each(SCRIPT_NAMES)('%s dá sempre o mesmo input para o mesmo tick', (name) => {
    const a = createScript(name, 7);
    const b = createScript(name, 7);
    for (let tick = 0; tick < 500; tick += 1) {
      expect(a(tick, context())).toEqual(b(tick, context()));
    }
  });

  it('os roteiros de movimento seguram a arma pedida, sem atirar', () => {
    const input = createScript('circle', 1)(0, context({ weaponSlot: 'secondary' }));
    expect(input).toMatchObject({ fire: false, reload: false, weaponSlot: 'secondary' });
  });

  it('idle fica parado', () => {
    const script = createScript('idle', 1);
    expect(script(0, context())).toMatchObject({ moveX: 0, moveY: 0 });
    expect(script(999, context())).toMatchObject({ moveX: 0, moveY: 0 });
  });

  it('circle passa pelas 8 direções e mira para onde anda (W, movimento relativo à mira)', () => {
    const script = createScript('circle', 1);
    const aims = new Set<string>();
    for (let tick = 0; tick < 64; tick += 1) {
      const input = script(tick, context());
      expect(input).toMatchObject({ moveX: 0, moveY: -1 });
      aims.add(input.aimAngle.toFixed(6));
    }
    expect(aims.size).toBe(8);
  });

  it('square anda em linha reta em cada lado e volta ao começo', () => {
    const script = createScript('square', 1);
    const heading = (tick: number) => {
      const input = script(tick, context());
      expect(input).toMatchObject({ moveX: 0, moveY: -1 });
      return input.aimAngle;
    };
    expect(heading(0)).toBeCloseTo(0, 9);
    expect(heading(44)).toBeCloseTo(0, 9);
    expect(heading(45)).toBeCloseTo(Math.PI / 2, 9);
    expect(heading(90)).toBeCloseTo(Math.PI, 9);
    expect(heading(135)).toBeCloseTo(-Math.PI / 2, 9);
    expect(script(180, context())).toEqual(script(0, context()));
  });

  it('random-walk muda com a semente e usa os 3 modos', () => {
    const a = createScript('random-walk', 1);
    const b = createScript('random-walk', 2);
    const sequence = (script: typeof a) =>
      Array.from({ length: 300 }, (_v, tick) => script(tick, context()));
    expect(sequence(a)).not.toEqual(sequence(b));
    const modes = new Set(
      Array.from({ length: SIM_CONFIG.tickRate * 60 }, (_v, tick) => a(tick, context()).moveMode),
    );
    expect(modes).toEqual(new Set(['walk', 'slow', 'run']));
  });
});

describe('roteiro strafe', () => {
  it('anda em walk no eixo pedido, alternando -1 e 1 a cada 1500 ms', () => {
    const script = createScript('strafe', 1);
    const leg = Math.round(1500 / TICK_MS);
    // Movimento relativo à mira: mira no sentido do eixo e anda para frente (W).
    const heading = (tick: number, axis: 'x' | 'y') => {
      const input = script(tick, context({ axis }));
      expect(input).toMatchObject({ moveX: 0, moveY: -1, moveMode: 'walk' });
      return input.aimAngle;
    };
    expect(heading(0, 'y')).toBeCloseTo(-Math.PI / 2, 9);
    expect(heading(leg - 1, 'y')).toBeCloseTo(-Math.PI / 2, 9);
    expect(heading(leg, 'y')).toBeCloseTo(Math.PI / 2, 9);
    expect(heading(2 * leg, 'y')).toBeCloseTo(-Math.PI / 2, 9);
    expect(heading(0, 'x')).toBeCloseTo(Math.PI, 9);
  });
});

describe('roteiro aim-test', () => {
  const self: PlayerSimState = createPlayerState({ playerId: 'eu', team: 0, x: 400, y: 400 });

  function run(
    ticks: number,
    others: readonly RenderedPlayer[],
    overrides: Partial<ScriptContext> = {},
  ) {
    const script = createScript('aim-test', 1);
    return Array.from({ length: ticks }, (_v, tick) =>
      script(
        tick,
        context({ self, others: () => others, elapsedMs: tick * TICK_MS, ...overrides }),
      ),
    );
  }

  it('mira no centro do inimigo vivo mais próximo', () => {
    const inputs = run(1, [other('longe', 400, 900), other('perto', 600, 400)]);
    expect(inputs[0]?.aimAngle).toBeCloseTo(0, 9);
  });

  it('dispara a cada --fire-interval-ms, soltando o gatilho entre um e outro', () => {
    const inputs = run(30, [other('alvo', 600, 400)], { weaponSlot: 'primary' });
    const fired = inputs.flatMap((input, tick) => (input.fire ? [tick] : []));
    // 300 ms = 9 ticks: dispara nos ticks 0, 9, 18 e 27.
    expect(fired).toEqual([0, 9, 18, 27]);
  });

  it('não dispara com parede entre ele e o alvo', () => {
    const walled: CollisionMap = {
      ...OPEN_MAP,
      isSolid: (cx, cy) => OPEN_MAP.isSolid(cx, cy) || cx === 62,
    };
    expect(run(30, [other('alvo', 600, 400)], { map: walled }).some((input) => input.fire)).toBe(
      false,
    );
  });

  it('não dispara em aliado nem com o raio passando ao lado do alvo', () => {
    expect(run(30, [other('amigo', 600, 400, 0)]).some((input) => input.fire)).toBe(false);
  });

  it('não dispara com a arma errada na mão nem no fim do roteiro', () => {
    expect(
      run(30, [other('alvo', 600, 400)], { weaponSlot: 'secondary' }).some((input) => input.fire),
    ).toBe(false);
    const late = run(30, [other('alvo', 600, 400)], { durationMs: 1000 });
    expect(late.some((input) => input.fire)).toBe(false);
  });
});

describe('comandos de debug do headless', () => {
  it('manda teleporte, vida infinita e dispersão zero, nessa ordem', () => {
    expect(devCommands({ teleport: { x: 1, y: 2 }, god: true, noSpread: true })).toEqual([
      { kind: 'teleport', x: 1, y: 2 },
      { kind: 'god', enabled: true },
      { kind: 'no_spread', enabled: true },
    ]);
    expect(devCommands({ teleport: null, god: false, noSpread: false })).toEqual([]);
  });
});

describe('MetricsCollector', () => {
  it('resume snapshots, RTT e correções', () => {
    const metrics = new MetricsCollector();
    for (let time = 0; time <= 1000; time += 50) metrics.snapshot(time);
    metrics.rtt(140);
    metrics.rtt(160);
    metrics.correction(2);
    metrics.correction(NET_CONFIG.correctionMetricPx + 0.5);
    metrics.correction(12);
    const summary = metrics.summary(30);
    expect(summary).toMatchObject({
      snapshotsReceived: 21,
      avgSnapshotIntervalMs: 50,
      avgRttMs: 150,
      correctionsOver4px: 2,
      correctionsPerMinute: 4,
      maxCorrectionPx: 12,
      violations: [],
    });
  });

  it('mede o maior salto de outro jogador entre quadros', () => {
    const metrics = new MetricsCollector();
    metrics.frame([{ playerId: 'b', x: 0, y: 0 }]);
    metrics.frame([{ playerId: 'b', x: 3, y: 4 }]);
    metrics.frame([
      { playerId: 'b', x: 4, y: 4 },
      { playerId: 'c', x: 900, y: 900 },
    ]);
    expect(metrics.summary(1)).toMatchObject({ framesSampled: 3, maxOtherJumpPx: 5 });
  });

  it('resume o registro de acertos e falha abaixo de --min-hit-ratio', () => {
    const shots = {
      shotsFired: 40,
      localHits: 40,
      confirmedHits: 37,
      hitRegRatio: 37 / 40,
      rewindEstimateMs: 240,
      averageRewindMs: 251.25,
    };
    const summary = new MetricsCollector().summary(60, { minHitRatio: 0.95 }, shots);
    expect(summary).toMatchObject({
      shotsFired: 40,
      localHits: 40,
      confirmedHits: 37,
      hitRegRatio: 0.925,
      averageRewindMs: 251.3,
    });
    expect(summary.violations).toHaveLength(1);
    expect(new MetricsCollector().summary(60, { minHitRatio: 0.9 }, shots).violations).toEqual([]);
    // Sem acerto previsto, não dá para medir: falha.
    expect(new MetricsCollector().summary(60, { minHitRatio: 0.9 }).violations).toHaveLength(1);
  });

  it('aponta snapshot com vida de inimigo', () => {
    const metrics = new MetricsCollector();
    const base = {
      tick: 1,
      serverTimeMs: 0,
      ackSeq: 0,
      self: null,
      events: [],
    };
    const player = (playerId: string, team: 0 | 1, health?: number) => ({
      playerId,
      team,
      x: 0,
      y: 0,
      aimAngle: 0,
      moveMode: 'walk' as const,
      connected: true,
      alive: true,
      activeSlot: 'primary' as const,
      ...(health === undefined ? {} : { health }),
    });
    const ok: SnapshotMessage = {
      ...base,
      players: [player('eu', 0, 100), player('b', 0, 50), player('c', 1)],
    };
    const leak: SnapshotMessage = { ...base, players: [player('eu', 0, 100), player('c', 1, 40)] };
    metrics.snapshot(0, ok, 'eu');
    expect(metrics.summary(1).enemyHealthLeaks).toBe(0);
    metrics.snapshot(50, leak, 'eu');
    expect(metrics.summary(1)).toMatchObject({ enemyHealthLeaks: 1 });
    expect(metrics.summary(1).violations).toHaveLength(1);
  });

  it('aponta os limites violados', () => {
    const metrics = new MetricsCollector();
    for (let index = 0; index < 7; index += 1) metrics.correction(10);
    metrics.frame([{ playerId: 'b', x: 0, y: 0 }]);
    metrics.frame([{ playerId: 'b', x: 40, y: 0 }]);
    const summary = metrics.summary(60, { maxCorrectionsPerMinute: 6, maxOtherJumpPx: 32 });
    expect(summary.violations).toHaveLength(2);
    expect(
      metrics.summary(60, { maxCorrectionsPerMinute: 7, maxOtherJumpPx: 40 }).violations,
    ).toEqual([]);
  });
});
