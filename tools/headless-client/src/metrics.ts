// Métricas do cliente headless, impressas em JSON no fim da execução.

import { NET_CONFIG } from '@rainbow-pixel/shared';
import type { Vec2 } from '@rainbow-pixel/shared';

export interface MetricsLimits {
  /** Máximo de correções acima de 4 px por minuto. */
  readonly maxCorrectionsPerMinute?: number | undefined;
  /** Maior salto, em px, de outro jogador entre dois quadros. */
  readonly maxOtherJumpPx?: number | undefined;
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
  readonly violations: readonly string[];
}

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

  snapshot(nowMs: number): void {
    this.snapshotArrivals.push(nowMs);
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

  summary(durationSeconds: number, limits: MetricsLimits = {}): MetricsSummary {
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
      violations,
    };
  }
}
