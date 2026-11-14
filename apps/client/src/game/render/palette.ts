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
