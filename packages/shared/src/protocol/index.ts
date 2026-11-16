import type { BotDifficultyId } from '../catalog/botDifficulties.js';
import type { WeaponId, WeaponSlot } from '../catalog/weapons.js';
import type { InputCommand, MoveMode, TeamIndex, Vec2, WeaponState } from '../sim/types.js';

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

export const MATCH_PHASES = ['lobby', 'match'] as const;

/** A partida acontece na mesma sala do lobby, preservando código, host e reconexão. */
export type MatchPhase = (typeof MATCH_PHASES)[number];

export interface QuickMatchState {
  /** Código da sala, igual ao roomId. */
  readonly code: string;
  readonly hostSessionId: string;
  /** Jogadores por `playerId`. */
  readonly players: SyncedMap<LobbyPlayer>;
  readonly phase: MatchPhase;
  /** Mapa da partida. Vazio no lobby. */
  readonly mapId: string;
  /** Início da partida (ms desde 1970, relógio do servidor). 0 no lobby. */
  readonly matchStartedAt: number;
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
  /** Durante a partida só entra quem retoma a própria vaga desconectada. */
  MatchInProgress: 425,
} as const;

export type JoinErrorCode = (typeof JoinErrorCode)[keyof typeof JoinErrorCode];

export const ClientMessageType = {
  ToggleReady: 'toggle_ready',
  AddBot: 'add_bot',
  RemoveBot: 'remove_bot',
  Input: 'input',
  Ping: 'ping',
  /** Somente o host. A sala volta para o lobby. */
  EndMatch: 'end_match',
  /** Somente o host e somente com DEV_TOOLS=true no servidor. */
  DevForceStart: 'dev_force_start',
  /** Somente com DEV_TOOLS=true no servidor. */
  DevSetNet: 'dev_set_net',
  /** Comandos de debug (teleporte, vida infinita, dispersão zero). Somente com DEV_TOOLS=true. */
  DevCommand: 'dev_command',
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
  Snapshot: 'snapshot',
  Pong: 'pong',
  MatchCountdown: 'match_countdown',
} as const;

export type LobbyErrorCode =
  | 'not_host'
  | 'max_bots'
  | 'room_full'
  | 'team_full'
  | 'bot_not_found'
  | 'player_not_found'
  | 'already_in_room'
  | 'invalid_payload'
  | 'match_in_progress'
  | 'match_not_started'
  | 'teleport_blocked'
  | 'dev_tools_disabled';

export const LOBBY_ERROR_MESSAGES: Readonly<Record<LobbyErrorCode, string>> = {
  not_host: 'Somente o host pode fazer isso.',
  max_bots: 'A sala já tem o máximo de bots.',
  room_full: 'A sala está cheia.',
  team_full: 'Esse time já está completo.',
  bot_not_found: 'Bot não encontrado.',
  player_not_found: 'Jogador não encontrado.',
  already_in_room: 'Você já está nesta sala.',
  invalid_payload: 'Pedido inválido.',
  match_in_progress: 'A partida já está em andamento.',
  match_not_started: 'Isso só funciona durante a partida.',
  teleport_blocked: 'Não dá para teleportar para dentro de uma parede.',
  dev_tools_disabled: 'As ferramentas de teste estão desligadas no servidor.',
};

export interface LobbyErrorPayload {
  readonly code: LobbyErrorCode;
  readonly message: string;
}

// ---------------------------------------------------------------------------
// Partida: mensagens de jogo (o estado do jogo não vai no schema da sala)
// ---------------------------------------------------------------------------

/** cliente -> servidor, a 30 Hz: os últimos inputs ainda não confirmados. */
export interface InputMessage {
  readonly inputs: readonly InputCommand[];
}

export interface SnapshotPlayer {
  readonly playerId: string;
  /** Time do jogador: a visão do bot e o render não dependem do schema do lobby. */
  readonly team: TeamIndex;
  readonly x: number;
  readonly y: number;
  readonly aimAngle: number;
  readonly moveMode: MoveMode;
  readonly connected: boolean;
  readonly alive: boolean;
  /** Arma na mão. */
  readonly activeSlot: WeaponSlot;
  /** Vida: só do próprio jogador e dos aliados. Vida de inimigo nunca é enviada. */
  readonly health?: number;
}

/** Comandos de debug ligados para o próprio jogador (ferramenta de teste). */
export interface DevFlags {
  readonly god: boolean;
  readonly noSpread: boolean;
}

/** Estado completo do próprio jogador, usado pela reconciliação. */
export interface SnapshotSelf {
  readonly x: number;
  readonly y: number;
  readonly aimAngle: number;
  readonly moveMode: MoveMode;
  readonly health: number;
  readonly alive: boolean;
  /** Tempo até renascer, em ms. `null` enquanto vivo. */
  readonly respawnInMs: number | null;
  readonly weapon: WeaponState;
  readonly dev: DevFlags;
}

export const MATCH_EVENT_KINDS = ['shot', 'hit_confirm', 'damage_taken', 'kill'] as const;

export type MatchEventKind = (typeof MATCH_EVENT_KINDS)[number];

interface MatchEventBase {
  /** Crescente na partida. O cliente descarta eventId já visto. */
  readonly eventId: number;
  /** Tick do servidor em que aconteceu. */
  readonly tick: number;
}

/** Um disparo. Vai para todos. */
export interface ShotEvent extends MatchEventBase {
  readonly kind: 'shot';
  readonly shooterId: string;
  readonly weaponId: WeaponId;
  /** Centro do atirador quando disparou. */
  readonly origin: Vec2;
  /** Onde o raio parou. */
  readonly end: Vec2;
}

/** Acerto confirmado pelo servidor. Vai só para o atirador. */
export interface HitConfirmEvent extends MatchEventBase {
  readonly kind: 'hit_confirm';
  /** `seq` do input que disparou. */
  readonly seq: number;
  readonly targetId: string;
  readonly damage: number;
  readonly killed: boolean;
}

/** Dano recebido. Vai só para a vítima. */
export interface DamageTakenEvent extends MatchEventBase {
  readonly kind: 'damage_taken';
  readonly damage: number;
  /** De onde veio o tiro (centro do atirador). */
  readonly origin: Vec2;
}

/** Abate. Vai para todos. */
export interface KillEvent extends MatchEventBase {
  readonly kind: 'kill';
  readonly killerId: string;
  readonly victimId: string;
  readonly weaponId: WeaponId;
}

export type MatchEvent = ShotEvent | HitConfirmEvent | DamageTakenEvent | KillEvent;

/** servidor -> cliente, a 20 Hz. Montado para cada cliente. */
export interface SnapshotMessage {
  readonly tick: number;
  /** Instante do tick no relógio do servidor (ms desde 1970). */
  readonly serverTimeMs: number;
  /** Último `seq` de input deste cliente já processado pelo servidor. 0 se nenhum. */
  readonly ackSeq: number;
  /** O próprio jogador. `null` se quem recebe não está na partida. */
  readonly self: SnapshotSelf | null;
  /** Todos os jogadores (o fog of war entra no marco 0.5). */
  readonly players: readonly SnapshotPlayer[];
  /**
   * Eventos deste snapshot e dos últimos NET_CONFIG.eventRedundancySnapshots snapshots deste
   * cliente, em ordem de eventId.
   */
  readonly events: readonly MatchEvent[];
}

/** cliente -> servidor, a cada 1 s. */
export interface PingMessage {
  /** Relógio do cliente, devolvido no pong. */
  readonly clientTimeMs: number;
}

export interface PongMessage {
  readonly clientTimeMs: number;
  /** Relógio do servidor quando o pong saiu (ms desde 1970). */
  readonly serverTimeMs: number;
}

/** servidor -> cliente, uma vez por segundo da contagem para iniciar a partida. */
export interface MatchCountdownMessage {
  /** Segundos até a partida começar. `null`: contagem cancelada. */
  readonly secondsLeft: number | null;
}

/** cliente -> servidor: comando de debug, sempre aplicado a quem envia (ferramenta de teste). */
export type DevCommand =
  | { readonly kind: 'teleport'; readonly x: number; readonly y: number }
  | { readonly kind: 'god'; readonly enabled: boolean }
  | { readonly kind: 'no_spread'; readonly enabled: boolean };

/** Simulador de lag de um cliente (ferramenta de teste). */
export interface DevNetSettings {
  readonly latencyMs: number;
  readonly jitterMs: number;
  /** Perda de pacotes, de 0 a 100. */
  readonly lossPct: number;
}
