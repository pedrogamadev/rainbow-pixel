// Roteiros de input do cliente headless: o input de cada tick de 30 Hz.

import { aimTest } from './aimTest.js';
import { circle } from './circle.js';
import { idle } from './idle.js';
import { randomWalk } from './randomWalk.js';
import { square } from './square.js';
import { strafe } from './strafe.js';
import { withWeapon } from './types.js';
import type { InputScript } from './types.js';

export type { InputScript, ScriptContext, StrafeAxis } from './types.js';

export const SCRIPT_NAMES = [
  'idle',
  'circle',
  'square',
  'random-walk',
  'strafe',
  'aim-test',
] as const;
export type ScriptName = (typeof SCRIPT_NAMES)[number];

export function isScriptName(value: string): value is ScriptName {
  return SCRIPT_NAMES.some((name) => name === value);
}

/** `seed` só é usada pelo random-walk. */
export function createScript(name: ScriptName, seed: number): InputScript {
  switch (name) {
    case 'idle':
      return withWeapon(idle);
    case 'circle':
      return withWeapon(circle);
    case 'square':
      return withWeapon(square);
    case 'random-walk':
      return withWeapon(randomWalk(seed));
    case 'strafe':
      return strafe;
    case 'aim-test':
      return aimTest();
  }
}
