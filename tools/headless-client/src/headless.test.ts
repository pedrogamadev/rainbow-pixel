import { NET_CONFIG, SIM_CONFIG } from '@rainbow-pixel/shared';
import { describe, expect, it } from 'vitest';
import { ArgsError, parseHeadlessArgs } from './args.js';
import { MetricsCollector } from './metrics.js';
import { SCRIPT_NAMES, createScript } from './scripts/index.js';

describe('parseHeadlessArgs', () => {
  it('sem argumentos: dev1 cria a sala e fica parado por 60 s', () => {
    expect(parseHeadlessArgs([])).toEqual({
      user: 'dev1',
      room: { kind: 'create', bots: 0, wait: false },
      script: 'idle',
      durationSeconds: 60,
      seed: 1,
      net: null,
      limits: { maxCorrectionsPerMinute: undefined, maxOtherJumpPx: undefined },
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
  ])('recusa %j', (argv) => {
    expect(() => parseHeadlessArgs(argv)).toThrow(ArgsError);
  });
});

describe('roteiros', () => {
  it.each(SCRIPT_NAMES)('%s dá sempre o mesmo input para o mesmo tick', (name) => {
    const a = createScript(name, 7);
    const b = createScript(name, 7);
    for (let tick = 0; tick < 500; tick += 1) {
      expect(a(tick)).toEqual(b(tick));
    }
  });

  it('idle fica parado', () => {
    const script = createScript('idle', 1);
    expect(script(0)).toMatchObject({ moveX: 0, moveY: 0 });
    expect(script(999)).toMatchObject({ moveX: 0, moveY: 0 });
  });

  it('circle passa pelas 8 direções e mira para onde anda', () => {
    const script = createScript('circle', 1);
    const directions = new Set<string>();
    for (let tick = 0; tick < 64; tick += 1) {
      const input = script(tick);
      directions.add(`${input.moveX},${input.moveY}`);
      expect(input.aimAngle).toBeCloseTo(Math.atan2(input.moveY, input.moveX), 9);
    }
    expect(directions.size).toBe(8);
  });

  it('square anda em linha reta em cada lado e volta ao começo', () => {
    const script = createScript('square', 1);
    expect(script(0)).toMatchObject({ moveX: 1, moveY: 0 });
    expect(script(44)).toMatchObject({ moveX: 1, moveY: 0 });
    expect(script(45)).toMatchObject({ moveX: 0, moveY: 1 });
    expect(script(90)).toMatchObject({ moveX: -1, moveY: 0 });
    expect(script(135)).toMatchObject({ moveX: 0, moveY: -1 });
    expect(script(180)).toEqual(script(0));
  });

  it('random-walk muda com a semente e usa os 3 modos', () => {
    const a = createScript('random-walk', 1);
    const b = createScript('random-walk', 2);
    const sequence = (script: typeof a) => Array.from({ length: 300 }, (_v, tick) => script(tick));
    expect(sequence(a)).not.toEqual(sequence(b));
    const modes = new Set(
      Array.from({ length: SIM_CONFIG.tickRate * 60 }, (_v, tick) => a(tick).moveMode),
    );
    expect(modes).toEqual(new Set(['walk', 'slow', 'run']));
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
