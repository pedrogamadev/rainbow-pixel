export interface ModeDefinition {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
}

export const MODES = [
  { id: 'quick', name: 'Partida rápida', enabled: true },
  { id: 'unranked', name: 'Sem colocação', enabled: false },
  { id: 'ranked', name: 'Ranqueada', enabled: false },
] as const satisfies readonly ModeDefinition[];

export type ModeId = (typeof MODES)[number]['id'];
