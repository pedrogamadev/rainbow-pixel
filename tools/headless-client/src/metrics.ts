// Métricas do cliente headless, impressas em JSON no fim da execução.

import { NET_CONFIG } from '@rainbow-pixel/shared';
import type { SnapshotMessage, Vec2 } from '@rainbow-pixel/shared';
import type { ShotStats } from '../../../apps/client/src/game/GameClient.js';

export interface MetricsLimits {
  /** Máximo de correções acima de 4 px por minuto. */
  readonly maxCorrectionsPerMinute?: number | undefined;
  /** Maior salto, em px, de outro jogador entre dois quadros. */
  readonly maxOtherJumpPx?: number | undefined;
  /** Mínimo de acertos confirmados / acertos previstos localmente. */
  readonly minHitRatio?: number | undefined;
}

export interface MetricsSummary {
  readonly durationSeconds: number;
  readonly snapshotsReceived: number;
  readonly avgSnapshotIntervalMs: number | null;
  readonly avgRttMs: number | null;
  readonly correctionsOver4px: number;
  readonly correctionsPerMinute: number;
  readonly maxCorrectionPx: number;
  readonly framesSampled: number;
  readonly maxOtherJumpPx: number;
  /** Disparos previstos pelo cliente. */
  readonly shotsFired: number;
  /** Disparos em que o raio local acertou a posição interpolada do alvo. */
  readonly localHits: number;
  /** Desses, os que o servidor confirmou (hit_confirm do mesmo seq). */
  readonly confirmedHits: number;
  /** confirmedHits / localHits. `null` sem acerto previsto. */
  readonly hitRegRatio: number | null;
  /**
   * Média da volta no tempo estimada dos disparos: hora de chegada do input ao servidor menos
   * viewTimeMs. O servidor volta no máximo LAG_COMP_CONFIG.maxRewindMs.
   */
  readonly averageRewindMs: number | null;
  /** Jogadores de outro time que vieram com vida no snapshot (tem de ser 0). */
  readonly enemyHealthLeaks: number;
  readonly violations: readonly string[];
}

const NO_SHOTS: ShotStats = {
  shotsFired: 0,
  localHits: 0,
  confirmedHits: 0,
  hitRegRatio: null,
  rewindEstimateMs: null,
  averageRewindMs: null,
};

function average(values: readonly number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number | null, digits = 2): number | null {
  if (value === null) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export class MetricsCollector {
  private readonly snapshotArrivals: number[] = [];
  private readonly rttSamples: number[] = [];
  private correctionsOver = 0;
  private maxCorrection = 0;
  private frames = 0;
  private maxJump = 0;
  private previousOthers = new Map<string, Vec2>();
  private enemyHealthLeaks = 0;

  /**
   * Snapshot recebido. Com o conteúdo, confere também que nenhum jogador de outro time veio
   * com vida (escopo: vida de inimigo nunca sai do servidor).
   */
  snapshot(nowMs: number, message?: SnapshotMessage, selfId?: string): void {
    this.snapshotArrivals.push(nowMs);
    if (message === undefined || selfId === undefined) {
      return;
    }
    const team = message.players.find((player) => player.playerId === selfId)?.team;
    for (const player of message.players) {
      if (team !== undefined && player.team !== team && 'health' in player) {
        this.enemyHealthLeaks += 1;
      }
    }
  }

  rtt(rttMs: number): void {
    this.rttSamples.push(rttMs);
  }

  correction(errorPx: number): void {
    this.maxCorrection = Math.max(this.maxCorrection, errorPx);
    if (errorPx > NET_CONFIG.correctionMetricPx) {
      this.correctionsOver += 1;
    }
  }

  /** Um quadro desenhado: mede quanto cada outro jogador andou desde o quadro anterior. */
  frame(others: readonly ({ readonly playerId: string } & Vec2)[]): void {
    this.frames += 1;
    const current = new Map<string, Vec2>();
    for (const other of others) {
      const before = this.previousOthers.get(other.playerId);
      if (before !== undefined) {
        this.maxJump = Math.max(this.maxJump, Math.hypot(other.x - before.x, other.y - before.y));
      }
      current.set(other.playerId, { x: other.x, y: other.y });
    }
    this.previousOthers = current;
  }

  summary(
    durationSeconds: number,
    limits: MetricsLimits = {},
    shots: ShotStats = NO_SHOTS,
  ): MetricsSummary {
    const intervals = this.snapshotArrivals
      .slice(1)
      .map((at, index) => at - (this.snapshotArrivals[index] ?? at));
    const perMinute = durationSeconds > 0 ? (this.correctionsOver * 60) / durationSeconds : 0;
    const violations: string[] = [];
    if (
      limits.maxCorrectionsPerMinute !== undefined &&
      perMinute > limits.maxCorrectionsPerMinute
    ) {
      violations.push(
        `correções acima de ${NET_CONFIG.correctionMetricPx} px por minuto: ${round(perMinute)} (limite ${limits.maxCorrectionsPerMinute})`,
      );
    }
    if (limits.maxOtherJumpPx !== undefined && this.maxJump > limits.maxOtherJumpPx) {
      violations.push(
        `maior salto de outro jogador entre quadros: ${round(this.maxJump)} px (limite ${limits.maxOtherJumpPx})`,
      );
    }
    if (limits.minHitRatio !== undefined) {
      if (shots.hitRegRatio === null) {
        violations.push('nenhum acerto previsto localmente para medir o registro de acertos');
      } else if (shots.hitRegRatio < limits.minHitRatio) {
        violations.push(
          `acertos confirmados / previstos: ${round(shots.hitRegRatio, 3)} (mínimo ${limits.minHitRatio})`,
        );
      }
    }
    if (this.enemyHealthLeaks > 0) {
      violations.push(`snapshots com vida de inimigo: ${this.enemyHealthLeaks}`);
    }
    return {
      durationSeconds: round(durationSeconds) ?? 0,
      snapshotsReceived: this.snapshotArrivals.length,
      avgSnapshotIntervalMs: round(average(intervals)),
      avgRttMs: round(average(this.rttSamples)),
      correctionsOver4px: this.correctionsOver,
      correctionsPerMinute: round(perMinute) ?? 0,
      maxCorrectionPx: round(this.maxCorrection) ?? 0,
      framesSampled: this.frames,
      maxOtherJumpPx: round(this.maxJump) ?? 0,
      shotsFired: shots.shotsFired,
      localHits: shots.localHits,
      confirmedHits: shots.confirmedHits,
      hitRegRatio: round(shots.hitRegRatio, 3),
      averageRewindMs: round(shots.averageRewindMs, 1),
      enemyHealthLeaks: this.enemyHealthLeaks,
      violations,
    };
  }
}
