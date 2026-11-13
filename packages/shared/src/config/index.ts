import type { BotDifficultyId } from '../catalog/botDifficulties.js';

/** Formato da partida (escopo, seção 3.1). */
export const MATCH_CONFIG = {
  teamCount: 2,
  teamSize: 2,
  maxPlayers: 4,
} as const;

/** Regras do lobby (escopo, seções 3.1 e 16.2). */
export const LOBBY_CONFIG = {
  /** A sala precisa de pelo menos 1 humano, então no máximo 3 bots. */
  maxBots: 3,
  /** Tempo que a vaga de um jogador desconectado fica reservada. */
  reconnectionWindowSeconds: 60,
} as const;

export const ROOM_CODE_CONFIG = {
  length: 6,
  /** Sem I, L, O, 0 e 1, que se confundem ao ler ou ditar o código. */
  alphabet: 'ABCDEFGHJKMNPQRSTUVWXYZ23456789',
} as const;

export const NICKNAME_CONFIG = {
  minLength: 3,
  maxLength: 16,
} as const;

/**
 * Contas de teste criadas por `pnpm dev:seed-users` (escopo, seção 17).
 * Só existem em ambiente com DEV_TOOLS ligado; a senha fica fora do código.
 */
export const DEV_SEED_USERS = [
  { nickname: 'dev1', email: 'dev1@rainbowpixel.local' },
  { nickname: 'dev2', email: 'dev2@rainbowpixel.local' },
  { nickname: 'dev3', email: 'dev3@rainbowpixel.local' },
  { nickname: 'dev4', email: 'dev4@rainbowpixel.local' },
] as const;

/** Quais sons o bot percebe (escopo, seção 16.4, "Atenção a som"). */
export type BotSoundAttention = 'loud_only' | 'all' | 'all_prioritized';

export interface BotDifficultyParams {
  /** Tempo de reação ao ver um inimigo. */
  readonly reactionMs: number;
  /** Erro de mira, em graus para cada lado. */
  readonly aimErrorDeg: number;
  readonly turnSpeedDegPerSec: number;
  /** Rajada máxima antes de corrigir a mira. `null`: controle contínuo. */
  readonly maxBurst: number | null;
  readonly soundAttention: BotSoundAttention;
  /** Por quanto tempo o bot lembra a última posição vista do inimigo. */
  readonly memoryMs: number;
}

// Valores iniciais da seção 16.4 do escopo. Ainda não são usados no marco 0.1.
export const BOT_DIFFICULTY_PARAMS = {
  easy: {
    reactionMs: 700,
    aimErrorDeg: 12,
    turnSpeedDegPerSec: 180,
    maxBurst: 3,
    soundAttention: 'loud_only',
    memoryMs: 3000,
  },
  medium: {
    reactionMs: 450,
    aimErrorDeg: 7,
    turnSpeedDegPerSec: 300,
    maxBurst: 6,
    soundAttention: 'all',
    memoryMs: 6000,
  },
  hard: {
    reactionMs: 250,
    aimErrorDeg: 3,
    turnSpeedDegPerSec: 480,
    maxBurst: null,
    soundAttention: 'all_prioritized',
    memoryMs: 10000,
  },
} as const satisfies Record<BotDifficultyId, BotDifficultyParams>;
