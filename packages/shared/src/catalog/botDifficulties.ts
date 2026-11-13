export interface BotDifficultyDefinition {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
}

// Os parâmetros de cada dificuldade (seção 16.4 do escopo) ficam em config.
export const BOT_DIFFICULTIES = [
  { id: 'easy', name: 'Fácil', enabled: true },
  { id: 'medium', name: 'Médio', enabled: true },
  { id: 'hard', name: 'Difícil', enabled: true },
] as const satisfies readonly BotDifficultyDefinition[];

export type BotDifficultyId = (typeof BOT_DIFFICULTIES)[number]['id'];
