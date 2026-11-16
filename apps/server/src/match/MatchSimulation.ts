// Partida em andamento: mundo, fila de inputs por jogador e tick fixo de 30 Hz com acumulador.
// Sem Colyseus: a sala só repassa os inputs recebidos e envia os snapshots que este objeto monta.
// Marco 0.3: seed da partida (nunca enviada a cliente), histórico de posições para a compensação
// de lag, eventos de tiro com redundância por cliente e comandos de debug.

import { randomInt } from 'node:crypto';
import { createCollisionGrid, patrolWaypoints } from '@rainbow-pixel/maps';
import type { BotBrain } from '@rainbow-pixel/bots';
import type { MapDefinition } from '@rainbow-pixel/maps';
import {
  NET_CONFIG,
  SIM_CONFIG,
  TICK_MS,
  TICK_SECONDS,
  circleOverlapsSolid,
  createPlayerState,
  createWorld,
  stepWorld,
} from '@rainbow-pixel/shared';
import type {
  BotDifficultyId,
  CollisionMap,
  DevFlags,
  LobbyPlayerKind,
  PlayerSimState,
  SimWorld,
  SnapshotMessage,
  TeamIndex,
  WorldInput,
} from '@rainbow-pixel/shared';
import type { DevCommandTarget } from '../dev/devCommands.js';
import { BotController } from './BotController.js';
import { EventLog, eventsFromShots } from './events.js';
import { createInputQueue, enqueueInputs, stopInputs, takeTickInput } from './inputQueue.js';
import type { EnqueueResult, InputQueueState } from './inputQueue.js';
import { compensatedTargets, recordFrame, rewindTargetMs } from './lagCompensation.js';
import type { PositionHistory } from './lagCompensation.js';
import { NO_DEV_FLAGS, buildSnapshot } from './snapshots.js';
import { assignSpawns } from './spawns.js';

const SNAPSHOT_INTERVAL_MS = 1000 / NET_CONFIG.snapshotRate;

export interface MatchPlayerSetup {
  readonly playerId: string;
  readonly team: TeamIndex;
  readonly kind: LobbyPlayerKind;
  /** Só para bot. Sem ela, o bot joga no médio. */
  readonly botDifficulty?: BotDifficultyId;
}

export interface MatchSimulationOptions {
  readonly map: MapDefinition;
  /** Jogadores na ordem de entrada na sala (define os spawns). */
  readonly players: readonly MatchPlayerSetup[];
  /** Início da partida no relógio do servidor, em ms. */
  readonly startMs: number;
  /** Seed fixa (testes). Sem ela, a partida sorteia uma com o crypto do Node. */
  readonly seed?: number;
  /** Cérebro fixo para todos os bots (testes). Sem ele, nível 1 com a dificuldade de cada um. */
  readonly botBrain?: BotBrain;
}

export interface AdvanceResult {
  /** Ticks simulados nesta chamada. */
  readonly ticks: number;
  /** Hora de mandar snapshot (20 Hz). */
  readonly snapshotDue: boolean;
}

/** Input usado por um jogador no tick em andamento, para a compensação e os eventos. */
interface TickInputInfo {
  readonly seq: number;
  readonly viewTimeMs: number;
  readonly receivedAtMs: number;
}

/** Seed de 32 bits sorteada fora do pacote de simulação. */
function drawSeed(): number {
  return randomInt(0, 2 ** 32);
}

export class MatchSimulation implements DevCommandTarget {
  readonly mapId: string;
  private world: SimWorld;
  private readonly grid: CollisionMap;
  /** Seed da partida: sorteia o desvio dos tiros. Nunca sai do servidor. */
  private readonly seed: number;
  private readonly queues = new Map<string, InputQueueState>();
  private readonly kinds = new Map<string, LobbyPlayerKind>();
  private readonly bots: BotController;
  private readonly events = new EventLog();
  private readonly devFlags = new Map<string, DevFlags>();
  private history: PositionHistory = [];
  private readonly startMs: number;
  /** Tempo pulado porque o processo ficou parado (veja SIM_CONFIG.maxCatchUpTicks). */
  private skippedMs = 0;
  /** Começa cheio: o primeiro tick já manda um snapshot com as posições iniciais. */
  private snapshotClockMs = SNAPSHOT_INTERVAL_MS;

  constructor(options: MatchSimulationOptions) {
    const { map, players } = options;
    this.mapId = map.id;
    this.startMs = options.startMs;
    this.seed = options.seed ?? drawSeed();
    this.grid = createCollisionGrid(map);
    const spawns = assignSpawns(map, players);
    const states: PlayerSimState[] = players.map((player) => {
      const spawn = spawns.get(player.playerId) ?? { x: 0, y: 0 };
      return createPlayerState({ playerId: player.playerId, team: player.team, ...spawn });
    });
    this.world = createWorld(this.grid, states, spawns);
    for (const player of players) {
      this.queues.set(player.playerId, createInputQueue());
      this.kinds.set(player.playerId, player.kind);
      if (player.kind === 'human') {
        this.events.open(player.playerId);
      }
    }
    const bots = players.filter((player) => player.kind === 'bot');
    this.bots = new BotController({
      mapId: map.id,
      grid: this.grid,
      waypoints: patrolWaypoints(map),
      bots: bots.map((bot) => ({
        playerId: bot.playerId,
        difficulty: bot.botDifficulty ?? 'medium',
      })),
      seed: this.seed,
      ...(options.botBrain === undefined ? {} : { brain: options.botBrain }),
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
    const now = this.serverTimeMs;
    for (const [botId, command] of this.bots.inputsForTick(this.world, now, (id) =>
      this.snapshotFor(id, () => true, false),
    )) {
      this.enqueueInputs(botId, [command], now);
    }

    const inputs = new Map<string, WorldInput>();
    const used = new Map<string, TickInputInfo>();
    for (const [playerId, queue] of this.queues) {
      const { state, input, repeated, receivedAtMs } = takeTickInput(queue);
      this.queues.set(playerId, state);
      if (input !== null) {
        inputs.set(playerId, { input, repeated });
        used.set(playerId, {
          seq: input.seq,
          viewTimeMs: input.viewTimeMs,
          receivedAtMs: receivedAtMs ?? now,
        });
      }
    }

    const tickTimeMs = now + TICK_MS;
    const history = this.history;
    const result = stepWorld(this.world, inputs, {
      dt: TICK_SECONDS,
      seed: this.seed,
      targetsForShot: (shot, current) => {
        const info = used.get(shot.shooterId);
        if (info === undefined) {
          return current;
        }
        const timeMs = rewindTargetMs(info.viewTimeMs, info.receivedAtMs, tickTimeMs);
        return compensatedTargets(history, timeMs, current, tickTimeMs);
      },
      isInvulnerable: (playerId) => this.devFlags.get(playerId)?.god === true,
      hasNoSpread: (playerId) => this.devFlags.get(playerId)?.noSpread === true,
    });
    this.world = result.world;
    this.history = recordFrame(this.history, {
      tick: this.world.tick,
      timeMs: tickTimeMs,
      players: new Map(
        this.world.players.map((player) => [
          player.playerId,
          { x: player.x, y: player.y, alive: player.alive },
        ]),
      ),
    });
    this.events.publish(
      eventsFromShots(this.world.tick, result.shots, (id) => used.get(id)?.seq ?? 0),
    );
  }

  /**
   * Snapshot para `viewerId`. Por padrão leva os eventos novos dele (e os repetidos dos
   * últimos snapshots); `withEvents = false` monta só o estado, sem consumir eventos.
   */
  snapshotFor(
    viewerId: string,
    isConnected: (playerId: string) => boolean,
    withEvents = true,
  ): SnapshotMessage {
    return buildSnapshot({
      world: this.world,
      viewerId,
      ackSeq: this.queues.get(viewerId)?.lastProcessedSeq ?? 0,
      serverTimeMs: this.serverTimeMs,
      isConnected,
      events: withEvents ? this.events.takeForSnapshot(viewerId) : [],
      devFlags: this.devFlags.get(viewerId) ?? NO_DEV_FLAGS,
    });
  }

  /**
   * Conexão caiu: o jogador para no lugar e mantém a entidade (continua vulnerável e pode morrer
   * e renascer). Conexão voltou: a fila recomeça do zero, porque o cliente novo numera os
   * inputs a partir de 1, e os eventos voltam a ser guardados para ele.
   */
  setConnected(playerId: string, connected: boolean): void {
    const queue = this.queues.get(playerId);
    if (queue === undefined) {
      return;
    }
    this.queues.set(playerId, connected ? createInputQueue() : stopInputs(queue));
    if (this.kinds.get(playerId) !== 'human') {
      return;
    }
    if (connected) {
      this.events.open(playerId);
    } else {
      this.events.close(playerId);
    }
  }

  /** A vaga foi retomada por outra sessão: a entidade continua a mesma, com outro id. */
  renamePlayer(oldId: string, newId: string): void {
    if (!this.queues.has(oldId) || this.queues.has(newId)) {
      return;
    }
    const rename = (playerId: string) => (playerId === oldId ? newId : playerId);
    this.queues.delete(oldId);
    this.queues.set(newId, createInputQueue());
    this.kinds.set(newId, this.kinds.get(oldId) ?? 'human');
    this.kinds.delete(oldId);
    this.events.close(oldId);
    this.events.open(newId);
    const flags = this.devFlags.get(oldId);
    this.devFlags.delete(oldId);
    if (flags !== undefined) {
      this.devFlags.set(newId, flags);
    }
    this.world = {
      ...this.world,
      players: this.world.players.map((player) =>
        player.playerId === oldId ? { ...player, playerId: newId } : player,
      ),
      spawns: new Map([...this.world.spawns].map(([id, spawn]) => [rename(id), spawn])),
    };
    this.history = this.history.map((frame) => ({
      ...frame,
      players: new Map([...frame.players].map(([id, player]) => [rename(id), player])),
    }));
  }

  removePlayer(playerId: string): void {
    if (!this.queues.delete(playerId)) {
      return;
    }
    this.kinds.delete(playerId);
    this.devFlags.delete(playerId);
    this.events.close(playerId);
    const spawns = new Map(this.world.spawns);
    spawns.delete(playerId);
    this.world = {
      ...this.world,
      players: this.world.players.filter((player) => player.playerId !== playerId),
      spawns,
    };
  }

  // -------------------------------------------------------------------------
  // Comandos de debug (ferramenta de teste; a sala só chama com DEV_TOOLS=true)
  // -------------------------------------------------------------------------

  teleport(playerId: string, x: number, y: number): boolean {
    if (
      !this.hasPlayer(playerId) ||
      circleOverlapsSolid(this.grid, x, y, SIM_CONFIG.playerRadius)
    ) {
      return false;
    }
    this.world = {
      ...this.world,
      players: this.world.players.map((player) =>
        player.playerId === playerId ? { ...player, x, y } : player,
      ),
    };
    return true;
  }

  setGod(playerId: string, enabled: boolean): void {
    this.setDevFlag(playerId, { god: enabled });
  }

  setNoSpread(playerId: string, enabled: boolean): void {
    this.setDevFlag(playerId, { noSpread: enabled });
  }

  private setDevFlag(playerId: string, change: Partial<DevFlags>): void {
    if (this.hasPlayer(playerId)) {
      this.devFlags.set(playerId, { ...(this.devFlags.get(playerId) ?? NO_DEV_FLAGS), ...change });
    }
  }
}
