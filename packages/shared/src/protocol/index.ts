import type { BotDifficultyId } from '../catalog/botDifficulties.js';

// ---------------------------------------------------------------------------
// API REST
// ---------------------------------------------------------------------------

export interface ProfileDto {
  readonly id: string;
  readonly nickname: string;
  readonly level: number;
  readonly xp: number;
  /** Data ISO 8601. */
  readonly createdAt: string;
}

export interface CreateProfileBody {
  readonly nickname: string;
}

export type ApiErrorCode =
  | 'unauthorized'
  | 'invalid_body'
  | 'invalid_nickname'
  | 'nickname_taken'
  | 'profile_exists'
  | 'profile_not_found'
  | 'not_found'
  | 'internal_error';

export interface ApiErrorBody {
  readonly error: ApiErrorCode;
  /** Mensagem em PT-BR, pronta para mostrar ao jogador. */
  readonly message: string;
}

// ---------------------------------------------------------------------------
// Sala quick_match: estado sincronizado
// ---------------------------------------------------------------------------

export const QUICK_MATCH_ROOM_NAME = 'quick_match';

export const TEAM_INDEXES = [0, 1] as const;

export type TeamIndex = (typeof TEAM_INDEXES)[number];

export type LobbyPlayerKind = 'human' | 'bot';

/** Prefixo do `playerId` de um bot (`bot:<n>`). Para humano, o `playerId` é o sessionId. */
export const BOT_PLAYER_ID_PREFIX = 'bot:';

export interface LobbyPlayer {
  readonly kind: LobbyPlayerKind;
  /** Vazio para bot. */
  readonly profileId: string;
  readonly nickname: string;
  readonly team: TeamIndex;
  readonly ready: boolean;
  readonly connected: boolean;
  /** Vazio para humano. */
  readonly botDifficulty: BotDifficultyId | '';
}

/** Parte de leitura de um mapa sincronizado, como o cliente recebe do Colyseus. */
export interface SyncedMap<V> {
  readonly size: number;
  get(key: string): V | undefined;
  forEach(callback: (value: V, key: string) => void): void;
}

export interface QuickMatchState {
  /** Código da sala, igual ao roomId. */
  readonly code: string;
  readonly hostSessionId: string;
  /** Jogadores por `playerId`. */
  readonly players: SyncedMap<LobbyPlayer>;
}

// ---------------------------------------------------------------------------
// Sala quick_match: entrada e mensagens
// ---------------------------------------------------------------------------

export interface QuickMatchJoinOptions {
  /** JWT do Supabase do jogador. */
  readonly accessToken: string;
}

/**
 * Códigos de erro ao entrar na sala (recusa no onAuth ou no onJoin).
 * Seguem a faixa de status HTTP porque a recusa no onAuth vira o status da resposta
 * do matchmaking. Não colidem com os códigos do Colyseus (520 a 526 e 4xxx).
 */
export const JoinErrorCode = {
  InvalidToken: 401,
  ProfileNotFound: 403,
  AlreadyInRoom: 409,
  RoomFull: 423,
} as const;

export type JoinErrorCode = (typeof JoinErrorCode)[keyof typeof JoinErrorCode];

export const ClientMessageType = {
  ToggleReady: 'toggle_ready',
  AddBot: 'add_bot',
  RemoveBot: 'remove_bot',
} as const;

export interface AddBotPayload {
  readonly team: TeamIndex;
  readonly difficulty: BotDifficultyId;
}

export interface RemoveBotPayload {
  readonly playerId: string;
}

export const ServerMessageType = {
  LobbyError: 'lobby_error',
} as const;

export type LobbyErrorCode =
  | 'not_host'
  | 'max_bots'
  | 'room_full'
  | 'team_full'
  | 'bot_not_found'
  | 'player_not_found'
  | 'already_in_room'
  | 'invalid_payload';

export const LOBBY_ERROR_MESSAGES: Readonly<Record<LobbyErrorCode, string>> = {
  not_host: 'Somente o host pode fazer isso.',
  max_bots: 'A sala já tem o máximo de bots.',
  room_full: 'A sala está cheia.',
  team_full: 'Esse time já está completo.',
  bot_not_found: 'Bot não encontrado.',
  player_not_found: 'Jogador não encontrado.',
  already_in_room: 'Você já está nesta sala.',
  invalid_payload: 'Pedido inválido.',
};

export interface LobbyErrorPayload {
  readonly code: LobbyErrorCode;
  readonly message: string;
}
