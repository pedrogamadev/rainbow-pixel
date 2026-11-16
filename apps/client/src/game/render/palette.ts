// Cores do visual minimalista geométrico da partida.

import type { MaterialName } from '@rainbow-pixel/maps';
import type { TeamIndex } from '@rainbow-pixel/shared';

export const BACKGROUND_COLOR = 0x0b0c10;

export const MATERIAL_COLORS: Readonly<Record<MaterialName, number>> = {
  void: 0x0b0c10,
  floor: 0x2a2f3a,
  wall_soft: 0xb08a5a,
  wall_hard: 0x6b7385,
  barricade: 0x8a5a2b,
};

/** Time 0 (ataque) e time 1 (defesa). */
export const TEAM_COLORS: Readonly<Record<TeamIndex, number>> = {
  0: 0xf2994a,
  1: 0x4f8cff,
};

export const SELF_OUTLINE_COLOR = 0xffffff;
export const AIM_LINE_COLOR = 0xffffff;
export const NICKNAME_COLOR = 0xe8eaf0;
/** Posição confirmada pelo servidor, desenhada sobre a prevista no overlay de debug. */
export const GHOST_COLOR = 0x4cc38a;

/** Tracer do próprio tiro (previsto) e dos tiros dos outros (eventos). */
export const OWN_TRACER_COLOR = 0xfff3c4;
export const OTHER_TRACER_COLOR = 0xffd27a;
/** Linhas da mira com a abertura atual. */
export const CROSSHAIR_COLOR = 0xffffff;
/** Marcador de acerto confirmado pelo servidor e de abate. */
export const HIT_MARKER_COLOR = 0xffffff;
export const KILL_MARKER_COLOR = 0xff5a5a;
/** Arco na borda da tela na direção de onde veio o dano. */
export const DAMAGE_INDICATOR_COLOR = 0xff3b3b;
/** Opacidade do corpo de quem morreu. */
export const DEAD_ALPHA = 0.25;
