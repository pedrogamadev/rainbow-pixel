import type { InputScript } from './types.js';

/** Parado, mirando para o leste. */
export const idle: InputScript = () => ({ moveX: 0, moveY: 0, aimAngle: 0, moveMode: 'walk' });
