// Desenho do combate no estilo minimalista geométrico: tracers, mira com a abertura atual,
// marcador de acerto e arco de dano na borda da tela.

import type { Vec2 } from '@rainbow-pixel/shared';
import { Graphics } from 'pixi.js';
import type { DamageIndicator, Tracer } from '../shots';
import {
  CROSSHAIR_COLOR,
  DAMAGE_INDICATOR_COLOR,
  HIT_MARKER_COLOR,
  KILL_MARKER_COLOR,
  OTHER_TRACER_COLOR,
  OWN_TRACER_COLOR,
} from './palette';

/** Linhas da mira: de quanto em quanto px do centro do jogador. */
const CROSSHAIR_START = 22;
const CROSSHAIR_END = 70;
/** Abertura mínima desenhada, para as duas linhas não virarem uma só. */
const MIN_DRAWN_SPREAD_DEG = 0.4;
const HIT_MARKER_SIZE = 6;
const HIT_MARKER_GAP = 3;
/** Arco de dano: distância da borda e abertura. */
const DAMAGE_ARC_MARGIN = 28;
const DAMAGE_ARC_HALF_SPAN = Math.PI / 9;

/** Tracers: linha curta que some em ~80 ms. Em coordenadas do mundo. */
export class TracersView {
  readonly graphics = new Graphics();

  update(tracers: readonly Tracer[]): void {
    const graphics = this.graphics.clear();
    for (const tracer of tracers) {
      graphics
        .moveTo(tracer.from.x, tracer.from.y)
        .lineTo(tracer.to.x, tracer.to.y)
        .stroke({
          width: tracer.own ? 2 : 1.5,
          color: tracer.own ? OWN_TRACER_COLOR : OTHER_TRACER_COLOR,
          alpha: tracer.alpha,
        });
    }
  }
}

export interface CrosshairState {
  /** Centro do próprio jogador, no mundo. */
  readonly origin: Vec2;
  readonly aimAngle: number;
  readonly recoilDeg: number;
  readonly spreadDeg: number;
  /** Marcador de acerto, se houver. */
  readonly hit: { readonly alpha: number; readonly killed: boolean } | null;
}

/** Mira: duas linhas mostrando a abertura atual (recuo e dispersão previstos). No mundo. */
export class CrosshairView {
  readonly graphics = new Graphics();

  update(state: CrosshairState | null): void {
    const graphics = this.graphics.clear();
    if (state === null) {
      return;
    }
    const center = state.aimAngle + (state.recoilDeg * Math.PI) / 180;
    const half = (Math.max(state.spreadDeg, MIN_DRAWN_SPREAD_DEG) * Math.PI) / 180;
    for (const angle of [center - half, center + half]) {
      graphics
        .moveTo(
          state.origin.x + Math.cos(angle) * CROSSHAIR_START,
          state.origin.y + Math.sin(angle) * CROSSHAIR_START,
        )
        .lineTo(
          state.origin.x + Math.cos(angle) * CROSSHAIR_END,
          state.origin.y + Math.sin(angle) * CROSSHAIR_END,
        )
        .stroke({ width: 1, color: CROSSHAIR_COLOR, alpha: 0.7 });
    }
    if (state.hit !== null) {
      // X na ponta da mira.
      const tip = {
        x: state.origin.x + Math.cos(center) * CROSSHAIR_END,
        y: state.origin.y + Math.sin(center) * CROSSHAIR_END,
      };
      const color = state.hit.killed ? KILL_MARKER_COLOR : HIT_MARKER_COLOR;
      for (const [sx, sy] of [
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ] as const) {
        graphics
          .moveTo(tip.x + sx * HIT_MARKER_GAP, tip.y + sy * HIT_MARKER_GAP)
          .lineTo(
            tip.x + sx * (HIT_MARKER_GAP + HIT_MARKER_SIZE),
            tip.y + sy * (HIT_MARKER_GAP + HIT_MARKER_SIZE),
          )
          .stroke({ width: 2, color, alpha: state.hit.alpha });
      }
    }
  }
}

/** Arcos na borda da tela, na direção de onde veio o dano. Em coordenadas da tela. */
export class DamageIndicatorView {
  readonly graphics = new Graphics();

  /**
   * @param center posição do próprio jogador na tela
   * @param self posição do próprio jogador no mundo
   */
  update(
    indicators: readonly DamageIndicator[],
    self: Vec2 | null,
    center: Vec2,
    screen: { readonly width: number; readonly height: number },
  ): void {
    const graphics = this.graphics.clear();
    if (self === null) {
      return;
    }
    const radius = Math.max(40, Math.min(screen.width, screen.height) / 2 - DAMAGE_ARC_MARGIN);
    for (const indicator of indicators) {
      const angle = Math.atan2(indicator.origin.y - self.y, indicator.origin.x - self.x);
      const start = angle - DAMAGE_ARC_HALF_SPAN;
      graphics
        .moveTo(center.x + Math.cos(start) * radius, center.y + Math.sin(start) * radius)
        .arc(center.x, center.y, radius, angle - DAMAGE_ARC_HALF_SPAN, angle + DAMAGE_ARC_HALF_SPAN)
        .stroke({ width: 6, color: DAMAGE_INDICATOR_COLOR, alpha: indicator.alpha * 0.9 });
    }
  }
}
