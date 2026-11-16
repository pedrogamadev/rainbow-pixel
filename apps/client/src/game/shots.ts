// Efeitos de tiro da tela, em TypeScript puro (sem PixiJS): o render só desenha o que sai daqui.
// - Tiro próprio: tracer local imediato, na direção prevista (sem desvio). O evento `shot` do
//   próprio jogador não desenha um segundo tracer.
// - Tiros dos outros: tracer a partir do evento `shot`.
// - `hit_confirm`: marcador de acerto na mira. `damage_taken`: arco na direção de onde veio.
// - `kill`: feed com os últimos abates.

import { HUD_CONFIG } from '@rainbow-pixel/shared';
import type { MatchEvent, Vec2, WeaponId } from '@rainbow-pixel/shared';

export interface Tracer {
  readonly from: Vec2;
  readonly to: Vec2;
  /** Do próprio jogador (previsto) ou de outro (evento). */
  readonly own: boolean;
  /** 1 quando nasce, 0 quando some. */
  readonly alpha: number;
}

export interface DamageIndicator {
  /** De onde veio o tiro. */
  readonly origin: Vec2;
  readonly alpha: number;
}

export interface KillFeedEntry {
  readonly eventId: number;
  readonly killerId: string;
  readonly victimId: string;
  readonly weaponId: WeaponId;
}

interface Timed<T> {
  readonly value: T;
  readonly atMs: number;
}

function fade(atMs: number, nowMs: number, durationMs: number): number {
  return Math.max(0, 1 - (nowMs - atMs) / durationMs);
}

export class ShotEffects {
  private tracerList: Timed<Omit<Tracer, 'alpha'>>[] = [];
  private damageList: Timed<Vec2>[] = [];
  private kills: Timed<KillFeedEntry>[] = [];
  private hitMarkerAtMs: number | null = null;
  private hitMarkerKilled = false;

  constructor(private readonly selfId: string) {}

  /** Tiro previsto do próprio jogador: tracer na hora. */
  addLocalShot(from: Vec2, to: Vec2, nowMs: number): void {
    this.tracerList.push({ value: { from, to, own: true }, atMs: nowMs });
  }

  /** Evento novo da partida (já sem repetidos). */
  onEvent(event: MatchEvent, nowMs: number): void {
    switch (event.kind) {
      case 'shot':
        if (event.shooterId !== this.selfId) {
          this.tracerList.push({
            value: { from: event.origin, to: event.end, own: false },
            atMs: nowMs,
          });
        }
        return;
      case 'hit_confirm':
        this.hitMarkerAtMs = nowMs;
        this.hitMarkerKilled = event.killed;
        return;
      case 'damage_taken':
        this.damageList.push({ value: event.origin, atMs: nowMs });
        return;
      case 'kill':
        this.kills.push({
          value: {
            eventId: event.eventId,
            killerId: event.killerId,
            victimId: event.victimId,
            weaponId: event.weaponId,
          },
          atMs: nowMs,
        });
        return;
    }
  }

  tracers(nowMs: number): Tracer[] {
    this.tracerList = this.tracerList.filter((item) => nowMs - item.atMs < HUD_CONFIG.tracerMs);
    return this.tracerList.map((item) => ({
      ...item.value,
      alpha: fade(item.atMs, nowMs, HUD_CONFIG.tracerMs),
    }));
  }

  /** Marcador de acerto: opacidade e se o acerto matou. `null`: nenhum agora. */
  hitMarker(nowMs: number): { readonly alpha: number; readonly killed: boolean } | null {
    if (this.hitMarkerAtMs === null) {
      return null;
    }
    const alpha = fade(this.hitMarkerAtMs, nowMs, HUD_CONFIG.hitMarkerMs);
    return alpha > 0 ? { alpha, killed: this.hitMarkerKilled } : null;
  }

  damageIndicators(nowMs: number): DamageIndicator[] {
    this.damageList = this.damageList.filter(
      (item) => nowMs - item.atMs < HUD_CONFIG.damageIndicatorMs,
    );
    return this.damageList.map((item) => ({
      origin: item.value,
      alpha: fade(item.atMs, nowMs, HUD_CONFIG.damageIndicatorMs),
    }));
  }

  /** Os últimos abates, do mais antigo ao mais novo, enquanto não passam de 5 s. */
  killFeed(nowMs: number): KillFeedEntry[] {
    this.kills = this.kills
      .filter((item) => nowMs - item.atMs < HUD_CONFIG.killFeedMs)
      .slice(-HUD_CONFIG.killFeedSize);
    return this.kills.map((item) => item.value);
  }
}
