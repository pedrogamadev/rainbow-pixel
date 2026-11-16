// Registro de acertos com lag simulado, em processo: a partida do servidor (MatchSimulation), o
// simulador de lag do servidor (NetSimulator) e dois clientes de jogo iguais aos do headless
// (GameClient), num relógio virtual. É o cenário do critério 2 do marco 0.3 sem a rede, o
// Supabase e o Colyseus: alvo andando em strafe no eixo y com vida infinita e atirador com a M9
// e dispersão zero, nas posições registradas no README.

import { getMap } from '@rainbow-pixel/maps';
import {
  ClientMessageType,
  ServerMessageType,
  SIM_CONFIG,
  createSeededRandom,
} from '@rainbow-pixel/shared';
import type { DevNetSettings, InputMessage, PingMessage, PongMessage } from '@rainbow-pixel/shared';
import { describe, expect, it } from 'vitest';
import { NetSimulator, NO_LAG } from '../../../apps/server/src/dev/netSimulator.js';
import { MatchSimulation } from '../../../apps/server/src/match/MatchSimulation.js';
import { createCollisionGrid } from '@rainbow-pixel/maps';
import { GameClient } from '../../../apps/client/src/game/GameClient.js';
import type { GameTransport, ShotStats } from '../../../apps/client/src/game/GameClient.js';
import { createScript } from './scripts/index.js';
import type { InputScript, ScriptContext } from './scripts/index.js';

/** Relógio virtual com fila de tarefas. */
class VirtualClock {
  now = 0;
  private tasks: { at: number; order: number; run: () => void }[] = [];
  private order = 0;

  setTimeout(run: () => void, delayMs: number): { at: number; order: number; run: () => void } {
    const task = { at: this.now + Math.max(0, delayMs), order: this.order++, run };
    this.tasks.push(task);
    return task;
  }

  clearTimeout(handle: unknown): void {
    this.tasks = this.tasks.filter((task) => task !== handle);
  }

  every(intervalMs: number, run: () => void): void {
    const tick = () => {
      run();
      this.setTimeout(tick, intervalMs);
    };
    this.setTimeout(tick, 0);
  }

  runUntil(endMs: number): void {
    for (;;) {
      this.tasks.sort((a, b) => a.at - b.at || a.order - b.order);
      const next = this.tasks[0];
      if (next === undefined || next.at > endMs) break;
      this.tasks.shift();
      this.now = next.at;
      next.run();
    }
    this.now = endMs;
  }
}

/** Transporte de um cliente ligado à partida pelo simulador de lag do servidor. */
function connect(
  clientId: string,
  clock: VirtualClock,
  net: NetSimulator,
  sim: MatchSimulation,
): GameTransport & { deliver(type: string, payload: unknown): void } {
  const handlers = new Map<string, Set<(payload: unknown) => void>>();
  const deliver = (type: string, payload: unknown) => {
    for (const handler of handlers.get(type) ?? []) handler(payload);
  };
  return {
    deliver,
    send(type, payload) {
      if (type === ClientMessageType.Input) {
        const { inputs } = payload as InputMessage;
        net.incoming(clientId, () => sim.enqueueInputs(clientId, inputs.slice(-3), clock.now));
      } else if (type === ClientMessageType.Ping) {
        // Como no servidor: o ping chega na hora e o pong sai pelo simulador.
        const pong: PongMessage = {
          clientTimeMs: (payload as PingMessage).clientTimeMs,
          serverTimeMs: clock.now,
        };
        net.outgoing(clientId, () => deliver(ServerMessageType.Pong, pong));
      }
    },
    onMessage(type, handler) {
      const set = handlers.get(type) ?? new Set();
      set.add(handler);
      handlers.set(type, set);
      return () => set.delete(handler);
    },
  };
}

interface Scenario {
  readonly shooterNet: DevNetSettings;
  readonly seconds: number;
}

function runHitRegistration({ shooterNet, seconds }: Scenario): ShotStats {
  const map = getMap('gym_01');
  const grid = createCollisionGrid(map);
  const clock = new VirtualClock();
  const net = new NetSimulator(NO_LAG, createSeededRandom(2026), {
    now: () => clock.now,
    setTimeout: (run, delay) => clock.setTimeout(run, delay),
    clearTimeout: (handle) => clock.clearTimeout(handle),
  });
  net.setSettings('atirador', shooterNet);
  // O alvo cria a sala (time 0) e o atirador entra pelo código (time 1).
  const sim = new MatchSimulation({
    map,
    players: [
      { playerId: 'alvo', team: 0, kind: 'human' },
      { playerId: 'atirador', team: 1, kind: 'human' },
    ],
    startMs: 0,
    seed: 99,
  });
  // Os comandos de debug do critério 2, como o headless manda no início da partida.
  expect(sim.teleport('alvo', 228, 400)).toBe(true);
  sim.setGod('alvo', true);
  expect(sim.teleport('atirador', 28, 400)).toBe(true);
  sim.setNoSpread('atirador', true);

  const transports = {
    alvo: connect('alvo', clock, net, sim),
    atirador: connect('atirador', clock, net, sim),
  };
  clock.every(SIM_CONFIG.serverLoopIntervalMs, () => {
    if (!sim.advance(clock.now).snapshotDue) return;
    for (const [id, transport] of Object.entries(transports)) {
      const snapshot = sim.snapshotFor(id, () => true);
      net.outgoing(id, () => transport.deliver(ServerMessageType.Snapshot, snapshot));
    }
  });

  const durationMs = seconds * 1000;
  const player = (
    id: 'alvo' | 'atirador',
    script: InputScript,
    options: Pick<ScriptContext, 'axis' | 'weaponSlot'>,
  ) => {
    const game = new GameClient({
      transport: transports[id],
      map: grid,
      selfId: id,
      now: () => clock.now,
    });
    let tick = 0;
    clock.every(1000 / 60, () =>
      game.update((self) => {
        const current = tick;
        tick += 1;
        return script(current, {
          elapsedMs: (current * 1000) / SIM_CONFIG.tickRate,
          durationMs,
          fireIntervalMs: 300,
          self,
          others: () => game.renderOthers(),
          map: grid,
          ...options,
        });
      }),
    );
    return game;
  };
  player('alvo', createScript('strafe', 1), { axis: 'y', weaponSlot: 'primary' });
  const shooter = player('atirador', createScript('aim-test', 1), {
    axis: 'x',
    weaponSlot: 'secondary',
  });
  clock.runUntil(durationMs);
  return shooter.shotStats();
}

describe('registro de acertos com lag simulado (critério 2 em processo)', () => {
  it('150 ms de RTT (75 de atraso, 20 de variação, 2% de perda): pelo menos 95%', () => {
    const stats = runHitRegistration({
      shooterNet: { latencyMs: 75, jitterMs: 20, lossPct: 2 },
      seconds: 60,
    });
    console.info('[registro de acertos] latência 75:', JSON.stringify(stats));
    expect(stats.localHits).toBeGreaterThan(100);
    expect(stats.hitRegRatio ?? 0).toBeGreaterThanOrEqual(0.95);
  });

  it('300 ms de RTT (150 de atraso): só registra o resultado, sem limite', () => {
    const stats = runHitRegistration({
      shooterNet: { latencyMs: 150, jitterMs: 20, lossPct: 2 },
      seconds: 60,
    });
    console.info('[registro de acertos] latência 150:', JSON.stringify(stats));
    expect(stats.localHits).toBeGreaterThan(100);
  });
});
