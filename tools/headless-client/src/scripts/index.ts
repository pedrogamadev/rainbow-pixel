// Roteiros de input do cliente headless: o input de cada tick de 30 Hz.

import { circle } from './circle.js';
import { idle } from './idle.js';
import { randomWalk } from './randomWalk.js';
import { square } from './square.js';
import type { InputScript } from './types.js';

export type { InputScript } from './types.js';

export const SCRIPT_NAMES = ['idle', 'circle', 'square', 'random-walk'] as const;
export type ScriptName = (typeof SCRIPT_NAMES)[number];

export function isScriptName(value: string): value is ScriptName {
  return SCRIPT_NAMES.some((name) => name === value);
}

/** `seed` só é usada pelo random-walk. */
export function createScript(name: ScriptName, seed: number): InputScript {
  switch (name) {
    case 'idle':
      return idle;
    case 'circle':
      return circle;
    case 'square':
      return square;
    case 'random-walk':
      return randomWalk(seed);
  }
}
