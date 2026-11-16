// Buffer de interpolação dos outros jogadores.
// TypeScript puro (sem DOM): também usado pelo cliente headless.
//
// Os outros jogadores são desenhados em `serverTime - 100 ms`, entre os dois snapshots
// vizinhos. Sem snapshot novo, a posição é extrapolada pela velocidade dos dois últimos
// snapshots por no máximo 100 ms; depois disso, para.

import { NET_CONFIG } from '@rainbow-pixel/shared';
import type { SnapshotMessage, SnapshotPlayer } from '@rainbow-pixel/shared';

interface BufferedSnapshot {
  readonly serverTimeMs: number;
  readonly players: ReadonlyMap<string, SnapshotPlayer>;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Interpola ângulos pelo menor arco. */
function lerpAngle(a: number, b: number, t: number): number {
  let delta = (b - a) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return a + delta * t;
}

export class InterpolationBuffer {
  private snapshots: BufferedSnapshot[] = [];

  push(snapshot: SnapshotMessage): void {
    const newest = this.snapshots.at(-1);
    if (newest !== undefined && snapshot.serverTimeMs <= newest.serverTimeMs) {
      return;
    }
    this.snapshots.push({
      serverTimeMs: snapshot.serverTimeMs,
      players: new Map(snapshot.players.map((player) => [player.playerId, player])),
    });
    const oldestKept = snapshot.serverTimeMs - NET_CONFIG.interpolationBufferMs;
    while (this.snapshots.length > 2 && (this.snapshots[0]?.serverTimeMs ?? 0) < oldestKept) {
      this.snapshots.shift();
    }
  }

  get size(): number {
    return this.snapshots.length;
  }

  /** Quantos snapshots estão à frente de `renderTimeMs`: a folga do buffer. */
  aheadOf(renderTimeMs: number): number {
    return this.snapshots.filter((snapshot) => snapshot.serverTimeMs > renderTimeMs).length;
  }

  clear(): void {
    this.snapshots = [];
  }

  /** Estado dos jogadores no instante `renderTimeMs` do relógio do servidor. */
  sample(renderTimeMs: number): SnapshotPlayer[] {
    const first = this.snapshots[0];
    const newest = this.snapshots.at(-1);
    if (first === undefined || newest === undefined) {
      return [];
    }
    if (renderTimeMs <= first.serverTimeMs) {
      return [...first.players.values()];
    }
    if (renderTimeMs >= newest.serverTimeMs) {
      return this.extrapolate(renderTimeMs);
    }
    const nextIndex = this.snapshots.findIndex((snapshot) => snapshot.serverTimeMs > renderTimeMs);
    const before = this.snapshots[nextIndex - 1];
    const after = this.snapshots[nextIndex];
    if (before === undefined || after === undefined) {
      return [...newest.players.values()];
    }
    const t = (renderTimeMs - before.serverTimeMs) / (after.serverTimeMs - before.serverTimeMs);
    return [...after.players.values()].map((to) => {
      const from = before.players.get(to.playerId);
      if (from === undefined) {
        return to;
      }
      return {
        ...to,
        x: lerp(from.x, to.x, t),
        y: lerp(from.y, to.y, t),
        aimAngle: lerpAngle(from.aimAngle, to.aimAngle, t),
      };
    });
  }

  private extrapolate(renderTimeMs: number): SnapshotPlayer[] {
    const newest = this.snapshots.at(-1);
    const previous = this.snapshots.at(-2);
    if (newest === undefined) {
      return [];
    }
    const ahead = Math.min(renderTimeMs - newest.serverTimeMs, NET_CONFIG.maxExtrapolationMs);
    if (previous === undefined || ahead <= 0) {
      return [...newest.players.values()];
    }
    const span = newest.serverTimeMs - previous.serverTimeMs;
    return [...newest.players.values()].map((now) => {
      const before = previous.players.get(now.playerId);
      if (before === undefined) {
        return now;
      }
      return {
        ...now,
        x: now.x + ((now.x - before.x) / span) * ahead,
        y: now.y + ((now.y - before.y) / span) * ahead,
      };
    });
  }
}
