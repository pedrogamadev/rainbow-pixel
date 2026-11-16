import { DEV_HEADLESS_CONFIG, TICK_MS } from '@rainbow-pixel/shared';
import type { InputScript } from './types.js';

/** Ticks em cada sentido: 1500 ms. */
const LEG_TICKS = Math.round(DEV_HEADLESS_CONFIG.strafeLegMs / TICK_MS);

/**
 * Anda em `walk` no eixo de --axis, alternando entre -1 e 1 a cada 1500 ms (começa no -1). É o
 * alvo do teste de registro de acertos: perpendicular à linha de tiro, o vaivém cobre 210 px.
 */
export const strafe: InputScript = (tick, context) => {
  const direction = Math.floor(tick / LEG_TICKS) % 2 === 0 ? -1 : 1;
  const moveX = context.axis === 'x' ? direction : 0;
  const moveY = context.axis === 'y' ? direction : 0;
  return {
    moveX,
    moveY,
    aimAngle: Math.atan2(moveY, moveX),
    moveMode: 'walk',
    fire: false,
    reload: false,
    weaponSlot: context.weaponSlot,
  };
};
