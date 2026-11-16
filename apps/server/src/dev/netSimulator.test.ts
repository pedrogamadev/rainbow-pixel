import { createSeededRandom } from '@rainbow-pixel/shared';
import { describe, expect, it } from 'vitest';
import { NO_LAG, NetSimulator } from './netSimulator.js';
import type { NetScheduler } from './netSimulator.js';

/** Relógio manual: os timers só disparam em `advance`. */
class FakeScheduler implements NetScheduler {
  private time = 0;
  private nextId = 1;
  private timers = new Map<number, { at: number; callback: () => void }>();

  now(): number {
    return this.time;
  }

  setTimeout(callback: () => void, delayMs: number): unknown {
    const id = this.nextId++;
    this.timers.set(id, { at: this.time + delayMs, callback });
    return id;
  }

  clearTimeout(handle: unknown): void {
    this.timers.delete(handle as number);
  }

  advance(ms: number): void {
    const end = this.time + ms;
    for (;;) {
      const next = [...this.timers.entries()]
        .filter(([, timer]) => timer.at <= end)
        .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (next === undefined) break;
      this.timers.delete(next[0]);
      this.time = Math.max(this.time, next[1].at);
      next[1].callback();
    }
    this.time = end;
  }
}

function setup(settings = NO_LAG, seed = 1) {
  const scheduler = new FakeScheduler();
  const sim = new NetSimulator(settings, createSeededRandom(seed), scheduler);
  return { scheduler, sim };
}

describe('NetSimulator', () => {
  it('sem lag, entrega na hora', () => {
    const { sim } = setup();
    const delivered: number[] = [];
    sim.incoming('c1', () => delivered.push(1));
    sim.outgoing('c1', () => delivered.push(2));
    expect(delivered).toEqual([1, 2]);
  });

  it('atrasa pelo latencyMs', () => {
    const { scheduler, sim } = setup({ latencyMs: 150, jitterMs: 0, lossPct: 0 });
    const delivered: number[] = [];
    sim.outgoing('c1', () => delivered.push(scheduler.now()));
    scheduler.advance(149);
    expect(delivered).toEqual([]);
    scheduler.advance(1);
    expect(delivered).toEqual([150]);
  });

  it('com variação, mantém a ordem de entrega em cada direção', () => {
    const { scheduler, sim } = setup({ latencyMs: 150, jitterMs: 40, lossPct: 0 }, 7);
    const incoming: number[] = [];
    const outgoing: number[] = [];
    const sentAt = new Map<number, number>();
    for (let index = 0; index < 500; index += 1) {
      sentAt.set(index, scheduler.now());
      sim.incoming('c1', () => {
        incoming.push(index);
        // Nunca chega antes do atraso mínimo.
        expect(scheduler.now() - (sentAt.get(index) ?? 0)).toBeGreaterThanOrEqual(110 - 1e-9);
      });
      sim.outgoing('c1', () => outgoing.push(index));
      scheduler.advance(10);
    }
    scheduler.advance(1000);
    const inOrder = Array.from({ length: 500 }, (_value, index) => index);
    expect(incoming).toEqual(inOrder);
    expect(outgoing).toEqual(inOrder);
  });

  it('a perda fica dentro da margem estatística, com semente fixa', () => {
    const { scheduler, sim } = setup({ latencyMs: 0, jitterMs: 0, lossPct: 2 }, 2026);
    let delivered = 0;
    const total = 20_000;
    for (let index = 0; index < total; index += 1) {
      sim.outgoing('c1', () => {
        delivered += 1;
      });
    }
    scheduler.advance(1);
    const lost = total - delivered;
    // 2% de 20.000 = 400, desvio padrão de ~20: margem de 4 desvios.
    expect(lost).toBeGreaterThan(400 - 80);
    expect(lost).toBeLessThan(400 + 80);
  });

  it('cada cliente tem os próprios valores', () => {
    const { scheduler, sim } = setup();
    sim.setSettings('lento', { latencyMs: 100, jitterMs: 0, lossPct: 0 });
    const delivered: string[] = [];
    sim.outgoing('lento', () => delivered.push('lento'));
    sim.outgoing('rapido', () => delivered.push('rapido'));
    expect(delivered).toEqual(['rapido']);
    scheduler.advance(100);
    expect(delivered).toEqual(['rapido', 'lento']);
    expect(sim.getSettings('lento').latencyMs).toBe(100);
    expect(sim.getSettings('rapido')).toEqual(NO_LAG);
  });

  it('cliente que saiu não recebe o que estava pendente', () => {
    const { scheduler, sim } = setup({ latencyMs: 50, jitterMs: 0, lossPct: 0 });
    let delivered = 0;
    sim.outgoing('c1', () => {
      delivered += 1;
    });
    sim.dropClient('c1');
    scheduler.advance(100);
    expect(delivered).toBe(0);
  });
});
