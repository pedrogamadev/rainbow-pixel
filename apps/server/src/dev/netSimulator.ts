// Simulador de lag (ferramenta de teste, escopo, seção 17). Por cliente, aplica atraso,
// variação e perda às mensagens recebidas de input e às enviadas de snapshot e pong.
// A ordem de entrega se mantém dentro de cada direção.
// Só existe com DEV_TOOLS=true: com a flag desligada, a sala nem cria o simulador.

import type { DevNetSettings, RandomSource } from '@rainbow-pixel/shared';

export interface NetScheduler {
  now(): number;
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

const realScheduler: NetScheduler = {
  now: () => performance.now(),
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) => {
    clearTimeout(handle as ReturnType<typeof setTimeout>);
  },
};

type Direction = 'incoming' | 'outgoing';

interface Pending {
  readonly at: number;
  readonly deliver: () => void;
}

/** Fila de uma direção de um cliente. */
interface Lane {
  readonly pending: Pending[];
  /** Instante da última entrega agendada: a próxima nunca sai antes dela. */
  lastAt: number;
  timer: unknown;
}

interface ClientLanes {
  settings: DevNetSettings;
  readonly incoming: Lane;
  readonly outgoing: Lane;
}

export const NO_LAG: DevNetSettings = { latencyMs: 0, jitterMs: 0, lossPct: 0 };

function createLane(): Lane {
  return { pending: [], lastAt: Number.NEGATIVE_INFINITY, timer: null };
}

export class NetSimulator {
  private readonly clients = new Map<string, ClientLanes>();

  constructor(
    private readonly defaults: DevNetSettings,
    private readonly random: RandomSource,
    private readonly scheduler: NetScheduler = realScheduler,
  ) {}

  private lanes(clientId: string): ClientLanes {
    let lanes = this.clients.get(clientId);
    if (lanes === undefined) {
      lanes = { settings: this.defaults, incoming: createLane(), outgoing: createLane() };
      this.clients.set(clientId, lanes);
    }
    return lanes;
  }

  getSettings(clientId: string): DevNetSettings {
    return this.clients.get(clientId)?.settings ?? this.defaults;
  }

  setSettings(clientId: string, settings: DevNetSettings): void {
    this.lanes(clientId).settings = settings;
  }

  /** Mensagem recebida do cliente (input). */
  incoming(clientId: string, deliver: () => void): void {
    this.push(clientId, 'incoming', deliver);
  }

  /** Mensagem enviada ao cliente (snapshot, pong). */
  outgoing(clientId: string, deliver: () => void): void {
    this.push(clientId, 'outgoing', deliver);
  }

  /** Esquece um cliente que saiu: o que estava pendente não é mais entregue. */
  dropClient(clientId: string): void {
    const lanes = this.clients.get(clientId);
    if (lanes === undefined) return;
    for (const lane of [lanes.incoming, lanes.outgoing]) {
      if (lane.timer !== null) this.scheduler.clearTimeout(lane.timer);
    }
    this.clients.delete(clientId);
  }

  dispose(): void {
    for (const clientId of [...this.clients.keys()]) {
      this.dropClient(clientId);
    }
  }

  private push(clientId: string, direction: Direction, deliver: () => void): void {
    const lanes = this.lanes(clientId);
    const { latencyMs, jitterMs, lossPct } = lanes.settings;
    if (lossPct > 0 && this.random() * 100 < lossPct) {
      return;
    }
    const lane = lanes[direction];
    const now = this.scheduler.now();
    const variation = jitterMs > 0 ? (this.random() * 2 - 1) * jitterMs : 0;
    const at = Math.max(now + Math.max(0, latencyMs + variation), lane.lastAt);
    lane.lastAt = at;
    if (at <= now && lane.pending.length === 0) {
      deliver();
      return;
    }
    lane.pending.push({ at, deliver });
    if (lane.timer === null) {
      this.schedule(lane);
    }
  }

  private schedule(lane: Lane): void {
    const head = lane.pending[0];
    if (head === undefined) {
      lane.timer = null;
      return;
    }
    lane.timer = this.scheduler.setTimeout(
      () => {
        lane.timer = null;
        const now = this.scheduler.now();
        while (lane.pending.length > 0 && (lane.pending[0]?.at ?? Infinity) <= now) {
          lane.pending.shift()?.deliver();
        }
        this.schedule(lane);
      },
      Math.max(0, head.at - this.scheduler.now()),
    );
  }
}
