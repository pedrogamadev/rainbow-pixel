// Conexão de jogo: amostra o input a 30 Hz, envia ao servidor, recebe snapshots e pongs, e
// mantém a previsão do próprio jogador (posição e arma), a interpolação dos outros, o relógio,
// os eventos da partida (sem repetidos) e as métricas de tiro.
// TypeScript puro (sem DOM, sem PixiJS e sem o SDK do Colyseus): o cliente web e o cliente
// headless usam esta mesma classe, cada um com o seu transporte.

import {
  ClientMessageType,
  NET_CONFIG,
  ServerMessageType,
  TICK_MS,
  hitscan,
  isMoving,
  spreadDeg,
} from '@rainbow-pixel/shared';
import type {
  CollisionMap,
  InputCommand,
  InputMessage,
  MatchEvent,
  PingMessage,
  PlayerInput,
  PlayerSimState,
  PongMessage,
  ShotFired,
  SnapshotMessage,
  SnapshotPlayer,
  SnapshotSelf,
  TeamIndex,
  Vec2,
} from '@rainbow-pixel/shared';
import { ServerClock } from './clock.js';
import { InterpolationBuffer } from './interpolation.js';
import { Predictor } from './prediction.js';
import type { Correction, ServerPlayerState } from './prediction.js';

/** O que o GameClient precisa da sala: enviar e receber mensagens. */
export interface GameTransport {
  send(type: string, payload: unknown): void;
  /** Devolve a função que cancela a inscrição. */
  onMessage(type: string, handler: (payload: unknown) => void): () => void;
}

/** Lê o input do jogador (teclado e mouse, ou um roteiro) para o próximo tick. */
export type InputSampler = (self: PlayerSimState | null) => PlayerInput;

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
  /** Time que veio no snapshot. */
  readonly team: TeamIndex;
  readonly x: number;
  readonly y: number;
  readonly aimAngle: number;
  readonly connected: boolean;
  readonly alive: boolean;
}

export interface ShotStats {
  /** Disparos previstos pelo próprio cliente. */
  readonly shotsFired: number;
  /** Disparos em que o raio local acertou a posição interpolada de alguém. */
  readonly localHits: number;
  /** Disparos com acerto previsto que o servidor confirmou (hit_confirm do mesmo seq). */
  readonly confirmedHits: number;
  /** confirmedHits / localHits. `null` sem acerto previsto. */
  readonly hitRegRatio: number | null;
  /** Volta no tempo estimada do último input: hora de chegada ao servidor - viewTimeMs. */
  readonly rewindEstimateMs: number | null;
  /** Média da volta estimada dos disparos. */
  readonly averageRewindMs: number | null;
}

export interface GameStats extends ShotStats {
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

/** Disparo previsto pelo cliente, com o resultado do raio local. */
export interface LocalShot {
  readonly seq: number;
  readonly origin: Vec2;
  readonly end: Vec2;
  /** Quem o raio local acertou, na posição interpolada. `null`: parede. */
  readonly localTargetId: string | null;
}

export type CorrectionListener = (correction: Correction, nowMs: number) => void;
export type EventListener = (event: MatchEvent, nowMs: number) => void;
export type LocalShotListener = (shot: LocalShot, nowMs: number) => void;

/** Correções menores que isso são só arredondamento e não entram nas estatísticas. */
const CORRECTION_EPSILON_PX = 0.01;

/** eventIds lembrados para descartar os repetidos (bem mais que os de 4 snapshots). */
const SEEN_EVENTS_KEPT = 1024;

/** Disparos previstos lembrados para casar com o hit_confirm (bem mais que um RTT de tiros). */
const LOCAL_SHOTS_KEPT = 512;

function isSnapshot(payload: unknown): payload is SnapshotMessage {
  const snapshot = payload as SnapshotMessage | null;
  return (
    typeof snapshot === 'object' &&
    snapshot !== null &&
    Array.isArray(snapshot.players) &&
    Array.isArray(snapshot.events)
  );
}

function isPong(payload: unknown): payload is PongMessage {
  const pong = payload as PongMessage | null;
  return typeof pong?.clientTimeMs === 'number' && typeof pong.serverTimeMs === 'number';
}

function average(values: readonly number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

export class GameClient {
  readonly clock = new ServerClock();
  readonly interpolation = new InterpolationBuffer();
  private readonly predictor: Predictor;
  private readonly unsubscribe: (() => void)[] = [];
  private readonly correctionListeners = new Set<CorrectionListener>();
  private readonly eventListeners = new Set<EventListener>();
  private readonly shotListeners = new Set<LocalShotListener>();
  private readonly recentCorrections: number[] = [];
  private readonly seenEvents = new Set<number>();
  /** Disparos previstos, pelo seq, para casar com o hit_confirm. */
  private readonly localShots = new Map<number, LocalShot>();
  private readonly confirmedSeqs = new Set<number>();
  private readonly rewinds: number[] = [];
  private nextSeq = 1;
  private lastUpdateMs: number | null = null;
  private inputAccumulatorMs = 0;
  private lastPingMs = Number.NEGATIVE_INFINITY;
  private lastSnapshot: SnapshotMessage | null = null;
  private lastInput: InputCommand | null = null;
  private snapshotsReceived = 0;
  private lastCorrectionPx = 0;
  private shotsFired = 0;
  private localHits = 0;
  private confirmedHits = 0;

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

  private sendInput(sampled: PlayerInput): void {
    const now = this.options.now();
    const input: InputCommand = {
      ...sampled,
      seq: this.nextSeq,
      // O instante que a interpolação está desenhando: é o que o jogador vê dos outros.
      viewTimeMs: this.drawnTime() ?? 0,
    };
    this.nextSeq += 1;
    this.lastInput = input;
    const shot = this.predictor.applyInput(input);
    if (shot !== null) {
      this.handleLocalShot(input, shot, now);
    }
    // Até os 3 últimos inputs ainda não confirmados, contra perda de pacote.
    const message: InputMessage = {
      inputs: this.predictor.pendingInputs.slice(-NET_CONFIG.inputRedundancy),
    };
    this.options.transport.send(ClientMessageType.Input, message);
  }

  /** Disparo previsto: raio local contra o mapa e os outros vivos na posição interpolada. */
  private handleLocalShot(input: InputCommand, shot: ShotFired, nowMs: number): void {
    const targets = this.renderOthers()
      .filter((other) => other.alive)
      .map((other) => ({ playerId: other.playerId, x: other.x, y: other.y }));
    const result = hitscan(this.options.map, shot.origin, shot.angle, targets);
    const local: LocalShot = {
      seq: input.seq,
      origin: shot.origin,
      end: result.end,
      localTargetId: result.target?.playerId ?? null,
    };
    this.localShots.set(input.seq, local);
    if (this.localShots.size > LOCAL_SHOTS_KEPT) {
      const oldest = this.localShots.keys().next().value;
      if (oldest !== undefined) this.localShots.delete(oldest);
    }
    this.shotsFired += 1;
    if (local.localTargetId !== null) {
      this.localHits += 1;
    }
    const rewind = this.rewindEstimateMs(input.viewTimeMs, nowMs);
    if (rewind !== null) {
      this.rewinds.push(rewind);
    }
    for (const listener of this.shotListeners) {
      listener(local, nowMs);
    }
  }

  private handleSnapshot(snapshot: SnapshotMessage): void {
    const now = this.options.now();
    this.snapshotsReceived += 1;
    this.lastSnapshot = snapshot;
    this.clock.onSnapshot(snapshot.serverTimeMs, now);
    this.interpolation.push(snapshot);
    this.handleEvents(snapshot.events, now);

    const me = snapshot.players.find((player) => player.playerId === this.options.selfId);
    const self = snapshot.self;
    if (me === undefined || self === null) {
      return;
    }
    const server: ServerPlayerState = {
      team: me.team,
      x: self.x,
      y: self.y,
      aimAngle: self.aimAngle,
      moveMode: self.moveMode,
      health: self.health,
      alive: self.alive,
      respawnAtTick:
        self.respawnInMs === null ? null : snapshot.tick + Math.round(self.respawnInMs / TICK_MS),
      weapon: self.weapon,
    };
    const correction = this.predictor.reconcile(server, snapshot.ackSeq, now);
    if (correction !== null && correction.errorPx > CORRECTION_EPSILON_PX) {
      this.lastCorrectionPx = correction.errorPx;
      this.recentCorrections.push(now);
      for (const listener of this.correctionListeners) {
        listener(correction, now);
      }
    }
  }

  /** Eventos do snapshot: os repetidos (eventId já visto) são descartados. */
  private handleEvents(events: readonly MatchEvent[], nowMs: number): void {
    for (const event of events) {
      if (this.seenEvents.has(event.eventId)) {
        continue;
      }
      this.seenEvents.add(event.eventId);
      if (this.seenEvents.size > SEEN_EVENTS_KEPT) {
        const oldest = this.seenEvents.values().next().value;
        if (oldest !== undefined) this.seenEvents.delete(oldest);
      }
      if (event.kind === 'hit_confirm' && !this.confirmedSeqs.has(event.seq)) {
        const local = this.localShots.get(event.seq);
        if (local !== undefined && local.localTargetId !== null) {
          this.confirmedSeqs.add(event.seq);
          this.confirmedHits += 1;
        }
      }
      for (const listener of this.eventListeners) {
        listener(event, nowMs);
      }
    }
  }

  onCorrection(listener: CorrectionListener): () => void {
    this.correctionListeners.add(listener);
    return () => {
      this.correctionListeners.delete(listener);
    };
  }

  /** Cada evento novo da partida, uma vez só. */
  onEvent(listener: EventListener): () => void {
    this.eventListeners.add(listener);
    return () => {
      this.eventListeners.delete(listener);
    };
  }

  /** Cada disparo previsto pelo próprio cliente, na hora. */
  onLocalShot(listener: LocalShotListener): () => void {
    this.shotListeners.add(listener);
    return () => {
      this.shotListeners.delete(listener);
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
      team: predicted.team,
      ...position,
      aimAngle: predicted.aimAngle,
      connected: true,
      alive: predicted.alive,
    };
  }

  /** Estado previsto completo do próprio jogador (arma, munição). */
  predictedSelf(): PlayerSimState | null {
    return this.predictor.predicted;
  }

  /** Último `self` do servidor: vida, tempo até renascer e comandos de debug ativos. */
  lastSelf(): SnapshotSelf | null {
    return this.lastSnapshot?.self ?? null;
  }

  /** Último input amostrado (para a dispersão prevista na mira). */
  lastSampledInput(): PlayerInput | null {
    return this.lastInput;
  }

  /** Abertura atual da mira, prevista: recuo e meia abertura da dispersão, em graus. */
  aimSpread(): { readonly recoilDeg: number; readonly spreadDeg: number } | null {
    const predicted = this.predictor.predicted;
    if (predicted === null) {
      return null;
    }
    const input = this.lastInput;
    const moving = input !== null && isMoving(input);
    return {
      recoilDeg: predicted.weapon.recoilDeg,
      spreadDeg: spreadDeg(predicted.weapon, { moving, moveMode: predicted.moveMode }),
    };
  }

  /** Instante do relógio do servidor em que os outros jogadores são desenhados. */
  renderTime(): number | null {
    const serverTime = this.clock.serverTime(this.options.now());
    return serverTime === null ? null : serverTime - NET_CONFIG.interpolationDelayMs;
  }

  /**
   * Instante que a interpolação está de fato desenhando: o `renderTime`, limitado ao que o
   * buffer cobre (o primeiro snapshot, ou o último mais a extrapolação máxima). É o
   * `viewTimeMs` dos inputs.
   */
  drawnTime(): number | null {
    const renderTime = this.renderTime();
    return renderTime === null ? null : this.interpolation.drawnTime(renderTime);
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

  /**
   * Volta no tempo que o servidor vai medir para um input amostrado agora: a hora estimada em
   * que ele chega lá (relógio do servidor visto pelo cliente mais o RTT) menos `viewTimeMs`.
   * O servidor limita a LAG_COMP_CONFIG.maxRewindMs.
   */
  private rewindEstimateMs(viewTimeMs: number, nowMs: number): number | null {
    const serverTime = this.clock.serverTime(nowMs);
    if (serverTime === null || viewTimeMs === 0) {
      return null;
    }
    return serverTime + (this.clock.rttMs ?? 0) - viewTimeMs;
  }

  shotStats(): ShotStats {
    const lastView = this.lastInput?.viewTimeMs;
    return {
      shotsFired: this.shotsFired,
      localHits: this.localHits,
      confirmedHits: this.confirmedHits,
      hitRegRatio: this.localHits === 0 ? null : this.confirmedHits / this.localHits,
      rewindEstimateMs:
        lastView === undefined ? null : this.rewindEstimateMs(lastView, this.options.now()),
      averageRewindMs: average(this.rewinds),
    };
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
      ...this.shotStats(),
    };
  }

  /**
   * A conexão voltou e o servidor recomeçou a fila deste jogador: os inputs voltam a ser
   * numerados a partir de 1 e os pendentes antigos são esquecidos. Os disparos antigos também,
   * para um seq repetido não casar com o hit_confirm errado.
   */
  resetInputs(): void {
    this.nextSeq = 1;
    this.predictor.clearPending();
    this.localShots.clear();
    this.confirmedSeqs.clear();
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribe.splice(0)) {
      unsubscribe();
    }
    this.correctionListeners.clear();
    this.eventListeners.clear();
    this.shotListeners.clear();
  }
}
