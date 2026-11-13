import type { Side } from './sides.js';

/** `player`: quantidade por jogador. `team`: quantidade compartilhada pelo time. */
export type GadgetQuantityScope = 'player' | 'team';

export interface GadgetDefinition {
  readonly id: string;
  readonly name: string;
  readonly side: Side;
  readonly quantity: number;
  readonly quantityScope: GadgetQuantityScope;
  readonly enabled: boolean;
}

// Seção 6 do escopo. Gadgets são fixos por lado na 1.0.
export const GADGETS = [
  {
    id: 'breach_charge',
    name: 'Carga de breach',
    side: 'attack',
    quantity: 2,
    quantityScope: 'player',
    enabled: true,
  },
  {
    id: 'drone',
    name: 'Drone',
    side: 'attack',
    quantity: 2,
    quantityScope: 'player',
    enabled: true,
  },
  {
    id: 'reinforcement',
    name: 'Reforço de parede',
    side: 'defense',
    quantity: 2,
    quantityScope: 'team',
    enabled: true,
  },
  {
    id: 'barricade',
    name: 'Barricada',
    side: 'defense',
    quantity: 2,
    quantityScope: 'player',
    enabled: true,
  },
] as const satisfies readonly GadgetDefinition[];

export type GadgetId = (typeof GADGETS)[number]['id'];
