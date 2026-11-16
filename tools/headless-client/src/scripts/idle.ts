import type { MoveScript } from './types.js';

/** Parado, mirando para o leste. */
export const idle: MoveScript = () => ({ moveX: 0, moveY: 0, aimAngle: 0, moveMode: 'walk' });
