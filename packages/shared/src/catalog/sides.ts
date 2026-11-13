export const SIDES = ['attack', 'defense'] as const;

export type Side = (typeof SIDES)[number];
