import type { GadgetId } from './gadgets.js';
import type { Side } from './sides.js';
import { WEAPONS, type WeaponId } from './weapons.js';

export interface OperatorDefinition {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
  /** Armas que o operador pode escolher. */
  readonly weaponIds: readonly WeaponId[];
  /** Gadgets fixos por lado. */
  readonly gadgetIds: Readonly<Record<Side, readonly GadgetId[]>>;
}

export const OPERATORS = [
  {
    id: 'recruit',
    name: 'Recruta',
    enabled: true,
    weaponIds: WEAPONS.map((weapon) => weapon.id),
    gadgetIds: {
      attack: ['breach_charge', 'drone'],
      defense: ['reinforcement', 'barricade'],
    },
  },
] as const satisfies readonly OperatorDefinition[];

export type OperatorId = (typeof OPERATORS)[number]['id'];
