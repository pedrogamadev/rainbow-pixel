// Partida em andamento: mundo, fila de inputs por jogador e tick fixo de 30 Hz com acumulador.
// Sem Colyseus: a sala só repassa os inputs recebidos e envia os snapshots que este objeto monta.

import { createCollisionGrid, patrolWaypoints } from '@rainbow-pixel/maps';
import type { MapDefinition } from '@rainbow-pixel/maps';
import {
  NET_CONFIG,
  SIM_CONFIG,
  TICK_MS,
  TICK_SECONDS,
  createWorld,
  stepWorld,
} from '@rainbow-pixel/shared';
import type {
  LobbyPlayerKind,
  MoveInput,
  PlayerSimState,
  SimWorld,
  SnapshotMessage,
  TeamIndex,
} from '@rainbow-pixel/shared';
import { BotController } from './BotController.js';
import { createInputQueue, enqueueInputs, stopInputs, takeTickInput } from './inputQueue.js';
import type { EnqueueResult, InputQueueState } from './inputQueue.js';
import { buildSnapshot } from './snapshots.js';
import { assignSpawns } from './spawns.js';

const SNAPSHOT_INTERVAL_MS = 1000 / NET_CONFIG.snapshotRate;

export interface MatchPlayerSetup {
  readonly playerId: string;
  readonly team: TeamIndex;
  readonly kind: LobbyPlayerKind;
}

export interface MatchSimulationOptions {
  readonly map: MapDefinition;
  /** Jogadores na ordem de entrada na sala (define os spawns). */
  readonly players: readonly MatchPlayerSetup[];
  /** Início da partida no relógio do servidor, em ms. */
  readonly startMs: number;
}

export interface AdvanceResult {
  /** Ticks simulados nesta chamada. */
  readonly ticks: number;
  /** Hora de mandar snapshot (20 Hz). */
  readonly snapshotDue: boolean;
}

export class MatchSimulation {
  readonly mapId: string;
  private world: SimWorld;
  private readonly queues = new Map<string, InputQueueState>();
  /** Time de cada jogador, pelo playerId. */
  private readonly teams = new Map<string, TeamIndex>();
  private readonly bots: BotController;
  private readonly startMs: number;
  /** Tempo pulado porque o processo ficou parado (veja SIM_CONFIG.maxCatchUpTicks). */
  private skippedMs = 0;
  /** Começa cheio: o primeiro tick já manda um snapshot com as posições iniciais. */
  private snapshotClockMs = SNAPSHOT_INTERVAL_MS;

  constructor(options: MatchSimulationOptions) {
    const { map, players } = options;
    this.mapId = map.id;
    this.startMs = options.startMs;
    const spawns = assignSpawns(map, players);
    const states: PlayerSimState[] = players.map((player) => {
      const spawn = spawns.get(player.playerId) ?? { x: 0, y: 0 };
      return { playerId: player.playerId, x: spawn.x, y: spawn.y, aimAngle: 0, moveMode: 'walk' };
    });
    this.world = createWorld(createCollisionGrid(map), states);
    for (const player of players) {
      this.queues.set(player.playerId, createInputQueue());
      this.teams.set(player.playerId, player.team);
    }
    this.bots = new BotController({
      mapId: map.id,
      waypoints: patrolWaypoints(map),
      botIds: players.filter((player) => player.kind === 'bot').map((player) => player.playerId),
    });
  }

  get tick(): number {
    return this.world.tick;
  }

  get players(): readonly PlayerSimState[] {
    return this.world.players;
  }

  /** Instante do tick atual no relógio do servidor. */
  get serverTimeMs(): number {
    return this.startMs + this.skippedMs + this.world.tick * TICK_MS;
  }

  hasPlayer(playerId: string): boolean {
    return this.queues.has(playerId);
  }

  /** Inputs recebidos de um jogador (humano ou bot), com as validações da fila. */
  enqueueInputs(playerId: string, inputs: readonly unknown[], nowMs: number): EnqueueResult | null {
    const queue = this.queues.get(playerId);
    if (queue === undefined) {
      return null;
    }
    const result = enqueueInputs(queue, inputs, nowMs);
    this.queues.set(playerId, result.state);
    return result;
  }

  /** Simula os ticks que couberam até `nowMs`. */
  advance(nowMs: number): AdvanceResult {
    // A folga evita perder um tick por arredondamento quando `nowMs` cai bem na fronteira.
    let due = Math.floor((nowMs - this.serverTimeMs) / TICK_MS + 1e-6);
    if (due > SIM_CONFIG.maxCatchUpTicks) {
      this.skippedMs += (due - SIM_CONFIG.maxCatchUpTicks) * TICK_MS;
      due = SIM_CONFIG.maxCatchUpTicks;
    }
    let snapshotDue = false;
    for (let tick = 0; tick < due; tick += 1) {
      this.step();
      this.snapshotClockMs += TICK_MS;
      if (this.snapshotClockMs >= SNAPSHOT_INTERVAL_MS) {
        this.snapshotClockMs -= SNAPSHOT_INTERVAL_MS;
        snapshotDue = true;
      }
    }
    return { ticks: Math.max(0, due), snapshotDue };
  }

  private step(): void {
    // Bots: um input por tick, enfileirado antes do consumo, então a fila deles nunca repete.
    for (const [botId, command] of this.bots.inputsForTick(this.world)) {
      this.enqueueInputs(botId, [command], this.serverTimeMs);
    }
    const inputs = new Map<string, MoveInput>();
    for (const [playerId, queue] of this.queues) {
      const { state, input } = takeTickInput(queue);
      this.queues.set(playerId, state);
      if (input !== null) {
        inputs.set(playerId, input);
      }
    }
    this.world = stepWorld(this.world, inputs, TICK_SECONDS);
  }

  snapshotFor(viewerId: string, isConnected: (playerId: string) => boolean): SnapshotMessage {
    return buildSnapshot({
      world: this.world,
      viewerId,
      ackSeq: this.queues.get(viewerId)?.lastProcessedSeq ?? 0,
      serverTimeMs: this.serverTimeMs,
      isConnected,
      teamOf: (playerId) => this.teams.get(playerId) ?? 0,
    });
  }

  /**
   * Conexão caiu: o jogador para no lugar e mantém a entidade. Conexão voltou: a fila
   * recomeça do zero, porque o cliente novo numera os inputs a partir de 1.
   */
  setConnected(playerId: string, connected: boolean): void {
    const queue = this.queues.get(playerId);
    if (queue !== undefined) {
      this.queues.set(playerId, connected ? createInputQueue() : stopInputs(queue));
    }
  }

  /** A vaga foi retomada por outra sessão: a entidade continua a mesma, com outro id. */
  renamePlayer(oldId: string, newId: string): void {
    if (!this.queues.has(oldId) || this.queues.has(newId)) {
      return;
    }
    this.queues.delete(oldId);
    this.queues.set(newId, createInputQueue());
    this.teams.set(newId, this.teams.get(oldId) ?? 0);
    this.teams.delete(oldId);
    this.world = {
      ...this.world,
      players: this.world.players.map((player) =>
        player.playerId === oldId ? { ...player, playerId: newId } : player,
      ),
    };
  }

  removePlayer(playerId: string): void {
    if (!this.queues.delete(playerId)) {
      return;
    }
    this.teams.delete(playerId);
    this.world = {
      ...this.world,
      players: this.world.players.filter((player) => player.playerId !== playerId),
    };
  }
}
