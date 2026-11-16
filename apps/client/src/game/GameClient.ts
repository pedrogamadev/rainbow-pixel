// Conexão de jogo: amostra o input a 30 Hz, envia ao servidor, recebe snapshots e pongs, e
// mantém a previsão do próprio movimento, a interpolação dos outros e o relógio.
// TypeScript puro (sem DOM, sem PixiJS e sem o SDK do Colyseus): o cliente web e o cliente
// headless usam esta mesma classe, cada um com o seu transporte.

import { ClientMessageType, NET_CONFIG, ServerMessageType, TICK_MS } from '@rainbow-pixel/shared';
import type {
  CollisionMap,
  InputCommand,
  InputMessage,
  MoveInput,
  PingMessage,
  PlayerSimState,
  PongMessage,
  SnapshotMessage,
  SnapshotPlayer,
} from '@rainbow-pixel/shared';
import { ServerClock } from './clock.js';
import { InterpolationBuffer } from './interpolation.js';
import { Predictor } from './prediction.js';
import type { Correction } from './prediction.js';

/** O que o GameClient precisa da sala: enviar e receber mensagens. */
export interface GameTransport {
  send(type: string, payload: unknown): void;
  /** Devolve a função que cancela a inscrição. */
  onMessage(type: string, handler: (payload: unknown) => void): () => void;
}

/** Lê o input do jogador (teclado e mouse, ou um roteiro) para o próximo tick. */
export type InputSampler = (self: PlayerSimState | null) => MoveInput;

export interface GameClientOptions {
  readonly transport: GameTransport;
  readonly map: CollisionMap;
  /** `playerId` deste cliente (o sessionId na sala). */
  readonly selfId: string;
  /** Relógio local, em ms. */
  readonly now: () => number;
}

export interface RenderedPlayer {
  readonly playerId: string;
  readonly x: number;
  readonly y: number;
  readonly aimAngle: number;
  readonly connected: boolean;
}

export interface GameStats {
  readonly rttMs: number | null;
  /** Tick do último snapshot. */
  readonly serverTick: number;
  readonly snapshotsReceived: number;
  /** Snapshots no buffer de interpolação à frente do instante desenhado. */
  readonly interpolationAhead: number;
  readonly interpolationSize: number;
  readonly pendingInputs: number;
  /** Correções de reconciliação no último segundo. */
  readonly correctionsPerSecond: number;
  readonly lastCorrectionPx: number;
}

export type CorrectionListener = (correction: Correction, nowMs: number) => void;

/** Correções menores que isso são só arredondamento e não entram nas estatísticas. */
const CORRECTION_EPSILON_PX = 0.01;

function isSnapshot(payload: unknown): payload is SnapshotMessage {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    Array.isArray((payload as SnapshotMessage).players)
  );
}

function isPong(payload: unknown): payload is PongMessage {
  const pong = payload as PongMessage | null;
  return typeof pong?.clientTimeMs === 'number' && typeof pong.serverTimeMs === 'number';
}

export class GameClient {
  readonly clock = new ServerClock();
  readonly interpolation = new InterpolationBuffer();
  private readonly predictor: Predictor;
  private readonly unsubscribe: (() => void)[] = [];
  private readonly correctionListeners = new Set<CorrectionListener>();
  private readonly recentCorrections: number[] = [];
  private nextSeq = 1;
  private lastUpdateMs: number | null = null;
  private inputAccumulatorMs = 0;
  private lastPingMs = Number.NEGATIVE_INFINITY;
  private lastSnapshot: SnapshotMessage | null = null;
  private snapshotsReceived = 0;
  private lastCorrectionPx = 0;

  constructor(private readonly options: GameClientOptions) {
    this.predictor = new Predictor(options.map, options.selfId);
    this.unsubscribe.push(
      options.transport.onMessage(ServerMessageType.Snapshot, (payload) => {
        if (isSnapshot(payload)) this.handleSnapshot(payload);
      }),
      options.transport.onMessage(ServerMessageType.Pong, (payload) => {
        if (isPong(payload)) this.clock.onPong(payload, this.options.now());
      }),
    );
  }

  get selfId(): string {
    return this.options.selfId;
  }

  /**
   * Chamado a cada quadro. Amostra um input por tick de 30 Hz que passou desde a última
   * chamada e manda os pings a cada 1 s.
   */
  update(sample: InputSampler): void {
    const now = this.options.now();
    if (now - this.lastPingMs >= NET_CONFIG.pingIntervalMs) {
      this.lastPingMs = now;
      const ping: PingMessage = { clientTimeMs: now };
      this.options.transport.send(ClientMessageType.Ping, ping);
    }

    if (this.lastUpdateMs === null) {
      this.lastUpdateMs = now;
    }
    this.inputAccumulatorMs += now - this.lastUpdateMs;
    this.lastUpdateMs = now;
    let ticks = Math.floor(this.inputAccumulatorMs / TICK_MS + 1e-6);
    this.inputAccumulatorMs -= ticks * TICK_MS;
    if (ticks > NET_CONFIG.clientMaxCatchUpTicks) {
      ticks = NET_CONFIG.clientMaxCatchUpTicks;
      this.inputAccumulatorMs = 0;
    }
    for (let tick = 0; tick < ticks; tick += 1) {
      this.sendInput(sample(this.predictor.predicted));
    }
  }

  private sendInput(move: MoveInput): void {
    const input: InputCommand = { ...move, seq: this.nextSeq };
    this.nextSeq += 1;
    this.predictor.applyInput(input);
    // Até os 3 últimos inputs ainda não confirmados, contra perda de pacote.
    const message: InputMessage = {
      inputs: this.predictor.pendingInputs.slice(-NET_CONFIG.inputRedundancy),
    };
    this.options.transport.send(ClientMessageType.Input, message);
  }

  private handleSnapshot(snapshot: SnapshotMessage): void {
    const now = this.options.now();
    this.snapshotsReceived += 1;
    this.lastSnapshot = snapshot;
    this.clock.onSnapshot(snapshot.serverTimeMs, now);
    this.interpolation.push(snapshot);
    const self = snapshot.players.find((player) => player.playerId === this.options.selfId);
    if (self === undefined) {
      return;
    }
    const correction = this.predictor.reconcile(
      { x: self.x, y: self.y, aimAngle: self.aimAngle, moveMode: self.moveMode },
      snapshot.ackSeq,
      now,
    );
    if (correction !== null && correction.errorPx > CORRECTION_EPSILON_PX) {
      this.lastCorrectionPx = correction.errorPx;
      this.recentCorrections.push(now);
      for (const listener of this.correctionListeners) {
        listener(correction, now);
      }
    }
  }

  onCorrection(listener: CorrectionListener): () => void {
    this.correctionListeners.add(listener);
    return () => {
      this.correctionListeners.delete(listener);
    };
  }

  /** O próprio jogador: previsão com a correção suave. `null` antes do primeiro snapshot. */
  renderSelf(): RenderedPlayer | null {
    const predicted = this.predictor.predicted;
    if (predicted === null) {
      return null;
    }
    const position = this.predictor.displayPosition(this.options.now());
    return {
      playerId: predicted.playerId,
      ...position,
      aimAngle: predicted.aimAngle,
      connected: true,
    };
  }

  /** Instante do relógio do servidor em que os outros jogadores são desenhados. */
  renderTime(): number | null {
    const serverTime = this.clock.serverTime(this.options.now());
    return serverTime === null ? null : serverTime - NET_CONFIG.interpolationDelayMs;
  }

  /** Os outros jogadores, interpolados no passado. */
  renderOthers(): RenderedPlayer[] {
    const renderTime = this.renderTime();
    if (renderTime === null) {
      return [];
    }
    return this.interpolation
      .sample(renderTime)
      .filter((player) => player.playerId !== this.options.selfId);
  }

  /** Posição do próprio jogador confirmada pelo servidor (o "fantasma" do overlay). */
  serverSelf(): SnapshotPlayer | null {
    return (
      this.lastSnapshot?.players.find((player) => player.playerId === this.options.selfId) ?? null
    );
  }

  stats(): GameStats {
    const now = this.options.now();
    while ((this.recentCorrections[0] ?? now) < now - 1000) {
      this.recentCorrections.shift();
    }
    const renderTime = this.renderTime();
    return {
      rttMs: this.clock.rttMs,
      serverTick: this.lastSnapshot?.tick ?? 0,
      snapshotsReceived: this.snapshotsReceived,
      interpolationAhead: renderTime === null ? 0 : this.interpolation.aheadOf(renderTime),
      interpolationSize: this.interpolation.size,
      pendingInputs: this.predictor.pendingInputs.length,
      correctionsPerSecond: this.recentCorrections.length,
      lastCorrectionPx: this.lastCorrectionPx,
    };
  }

  /**
   * A conexão voltou e o servidor recomeçou a fila deste jogador: os inputs voltam a ser
   * numerados a partir de 1 e os pendentes antigos são esquecidos.
   */
  resetInputs(): void {
    this.nextSeq = 1;
    this.predictor.clearPending();
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribe.splice(0)) {
      unsubscribe();
    }
    this.correctionListeners.clear();
  }
}
