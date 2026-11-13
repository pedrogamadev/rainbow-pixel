import { schema, t } from '@colyseus/schema';
import type { SchemaType } from '@colyseus/schema';
import {
  ClientMessageType,
  JoinErrorCode,
  LOBBY_CONFIG,
  LOBBY_ERROR_MESSAGES,
  MATCH_CONFIG,
  ServerMessageType,
  TEAM_INDEXES,
  isBotDifficultyId,
} from '@rainbow-pixel/shared';
import type {
  BotDifficultyId,
  LobbyErrorCode,
  LobbyErrorPayload,
  TeamIndex,
} from '@rainbow-pixel/shared';
import { Room, ServerError, matchMaker } from 'colyseus';
import type { Client } from 'colyseus';
import { z } from 'zod';
import { describeAuthFailure } from '../auth/verifyJwt.js';
import type { VerifyJwt } from '../auth/verifyJwt.js';
import type { ProfileStore } from '../db/profiles.js';
import {
  addBot,
  addHuman,
  createLobby,
  findPlayer,
  isReadyToStart,
  removeBot,
  removePlayer,
  setConnected,
  toggleReady,
} from './lobbySlots.js';
import type { LobbyFailure, LobbyState } from './lobbySlots.js';
import { generateUniqueRoomCode } from './roomCode.js';

// ---------------------------------------------------------------------------
// Estado sincronizado (espelha QuickMatchState de packages/shared)
// ---------------------------------------------------------------------------

export const LobbyPlayerState = schema(
  {
    kind: t.string().default('human'),
    profileId: t.string().default(''),
    nickname: t.string().default(''),
    team: t.uint8().default(0),
    ready: t.boolean().default(false),
    connected: t.boolean().default(true),
    botDifficulty: t.string().default(''),
  },
  'LobbyPlayerState',
);
export type LobbyPlayerState = SchemaType<typeof LobbyPlayerState>;

export const QuickMatchRoomState = schema(
  {
    code: t.string().default(''),
    hostSessionId: t.string().default(''),
    players: t.map(LobbyPlayerState),
  },
  'QuickMatchRoomState',
);
export type QuickMatchRoomState = SchemaType<typeof QuickMatchRoomState>;

// ---------------------------------------------------------------------------
// Dependências e autenticação
// ---------------------------------------------------------------------------

export interface QuickMatchRoomDependencies {
  readonly verifyJwt: VerifyJwt;
  readonly profiles: ProfileStore;
}

/** Resultado do onAuth: quem é o jogador, segundo o token e o banco. */
export interface RoomAuth {
  readonly profileId: string;
  readonly nickname: string;
}

type RoomClient = Client<{ auth: RoomAuth }>;

let dependencies: QuickMatchRoomDependencies | undefined;

/** Chamado uma vez na subida do servidor, antes de registrar a sala. */
export function configureQuickMatchRoom(deps: QuickMatchRoomDependencies): void {
  dependencies = deps;
}

const joinOptionsSchema = z.object({ accessToken: z.string().min(1) });

const INVALID_TOKEN_MESSAGE = 'Sessão inválida ou expirada. Faça login de novo.';
const PROFILE_NOT_FOUND_MESSAGE = 'Crie seu perfil antes de entrar em uma sala.';

// ---------------------------------------------------------------------------
// Mensagens do cliente
// ---------------------------------------------------------------------------

const addBotSchema = z.object({
  team: z.custom<TeamIndex>((value) => TEAM_INDEXES.some((team) => team === value)),
  difficulty: z.custom<BotDifficultyId>(
    (value) => typeof value === 'string' && isBotDifficultyId(value),
  ),
});

const removeBotSchema = z.object({ playerId: z.string().min(1) });

// ---------------------------------------------------------------------------
// Código da sala
// ---------------------------------------------------------------------------

/** Códigos de salas deste processo, inclusive as que ainda estão sendo criadas. */
const reservedCodes = new Set<string>();

/**
 * Diz se o código já pertence a uma sala ativa.
 * Quando está livre, já fica reservado para quem perguntou: duas salas criadas
 * ao mesmo tempo nunca recebem o mesmo código.
 */
async function isRoomCodeTaken(code: string): Promise<boolean> {
  if (reservedCodes.has(code)) {
    return true;
  }
  reservedCodes.add(code);
  if ((await matchMaker.getRoomById(code)) != null) {
    reservedCodes.delete(code);
    return true;
  }
  return false;
}

function joinErrorCode(error: LobbyFailure['error']): number {
  return error === 'already_in_room' ? JoinErrorCode.AlreadyInRoom : JoinErrorCode.RoomFull;
}

// ---------------------------------------------------------------------------
// Sala
// ---------------------------------------------------------------------------

/**
 * Lobby da partida rápida. Só organiza vagas, times, bots e "pronto":
 * neste marco não existe lógica de partida.
 */
export class QuickMatchRoom extends Room<{ state: QuickMatchRoomState; client: RoomClient }> {
  // Limita só humanos: bot não é cliente e não ocupa conexão.
  override maxClients = MATCH_CONFIG.maxPlayers;
  override state = new QuickMatchRoomState();

  /** Fonte da verdade do lobby. O estado sincronizado é só um espelho dela. */
  private lobby: LobbyState = createLobby();
  private readyToStart = false;

  /**
   * Roda no matchmaking, antes de a sala ser criada ou de a vaga ser reservada.
   * A identidade vem só do JWT; nenhum id enviado pelo cliente é usado.
   */
  static override async onAuth(_token: string, options: unknown): Promise<RoomAuth> {
    if (dependencies === undefined) {
      throw new Error('QuickMatchRoom usada antes de configureQuickMatchRoom().');
    }
    const { verifyJwt, profiles } = dependencies;

    const parsed = joinOptionsSchema.safeParse(options);
    if (!parsed.success) {
      throw new ServerError(JoinErrorCode.InvalidToken, INVALID_TOKEN_MESSAGE);
    }

    let userId: string;
    try {
      ({ userId } = await verifyJwt(parsed.data.accessToken));
    } catch (error) {
      console.warn(`[quick_match] token recusado (${describeAuthFailure(error)})`);
      throw new ServerError(JoinErrorCode.InvalidToken, INVALID_TOKEN_MESSAGE);
    }

    const profile = await profiles.findById(userId);
    if (profile === null) {
      throw new ServerError(JoinErrorCode.ProfileNotFound, PROFILE_NOT_FOUND_MESSAGE);
    }
    return { profileId: profile.id, nickname: profile.nickname };
  }

  // As opções de entrada trazem o token do jogador: não são lidas nem logadas aqui.
  override async onCreate(): Promise<void> {
    const code = await generateUniqueRoomCode(isRoomCodeTaken);
    this.roomId = code;
    this.state.code = code;

    this.onMessage(ClientMessageType.ToggleReady, (client) => {
      this.applyResult(client, toggleReady(this.lobby, client.sessionId));
    });

    this.onMessage<unknown>(ClientMessageType.AddBot, (client, message) => {
      const payload = addBotSchema.safeParse(message);
      if (!payload.success) {
        this.sendLobbyError(client, 'invalid_payload');
        return;
      }
      this.applyResult(client, addBot(this.lobby, client.sessionId, payload.data));
    });

    this.onMessage<unknown>(ClientMessageType.RemoveBot, (client, message) => {
      const payload = removeBotSchema.safeParse(message);
      if (!payload.success) {
        this.sendLobbyError(client, 'invalid_payload');
        return;
      }
      this.applyResult(client, removeBot(this.lobby, client.sessionId, payload.data.playerId));
    });
  }

  override onJoin(client: RoomClient, _options: unknown, auth: RoomAuth): void {
    const result = addHuman(this.lobby, {
      sessionId: client.sessionId,
      profileId: auth.profileId,
      nickname: auth.nickname,
    });
    if (!result.ok) {
      throw new ServerError(joinErrorCode(result.error), LOBBY_ERROR_MESSAGES[result.error]);
    }
    this.setLobby(result.lobby);
  }

  /** Queda de conexão: a vaga fica reservada pela janela de reconexão. */
  override onDrop(client: RoomClient): void {
    // Uma entrada recusada no onJoin também passa por aqui, sem vaga no lobby.
    if (findPlayer(this.lobby, client.sessionId) === undefined) {
      return;
    }
    this.setLobby(setConnected(this.lobby, client.sessionId, false));
    // Se o prazo vencer, o Colyseus chama onLeave. A rejeição não precisa de tratamento aqui.
    this.allowReconnection(client, LOBBY_CONFIG.reconnectionWindowSeconds).catch(() => {});
  }

  override onReconnect(client: RoomClient): void {
    this.setLobby(setConnected(this.lobby, client.sessionId, true));
  }

  /** Saída definitiva: o jogador sai da lista. Sem humano, a sala é descartada pelo autoDispose. */
  override onLeave(client: RoomClient): void {
    const result = removePlayer(this.lobby, client.sessionId);
    if (result.removed) {
      this.setLobby(result.lobby);
    }
  }

  override onDispose(): void {
    reservedCodes.delete(this.roomId);
  }

  private applyResult(
    client: RoomClient,
    result: { readonly ok: true; readonly lobby: LobbyState } | LobbyFailure,
  ): void {
    if (!result.ok) {
      this.sendLobbyError(client, result.error);
      return;
    }
    this.setLobby(result.lobby);
  }

  private sendLobbyError(client: RoomClient, code: LobbyErrorCode): void {
    const payload: LobbyErrorPayload = { code, message: LOBBY_ERROR_MESSAGES[code] };
    client.send(ServerMessageType.LobbyError, payload);
  }

  /** Guarda o lobby novo e copia para o estado sincronizado só o que mudou. */
  private setLobby(lobby: LobbyState): void {
    this.lobby = lobby;
    const { players } = this.state;

    const currentIds = new Set(lobby.players.map((player) => player.playerId));
    for (const playerId of [...players.keys()]) {
      if (!currentIds.has(playerId)) {
        players.delete(playerId);
      }
    }

    for (const slot of lobby.players) {
      let player = players.get(slot.playerId);
      if (player === undefined) {
        player = new LobbyPlayerState();
        players.set(slot.playerId, player);
      }
      if (player.kind !== slot.kind) player.kind = slot.kind;
      if (player.profileId !== slot.profileId) player.profileId = slot.profileId;
      if (player.nickname !== slot.nickname) player.nickname = slot.nickname;
      if (player.team !== slot.team) player.team = slot.team;
      if (player.ready !== slot.ready) player.ready = slot.ready;
      if (player.connected !== slot.connected) player.connected = slot.connected;
      if (player.botDifficulty !== slot.botDifficulty) player.botDifficulty = slot.botDifficulty;
    }

    if (this.state.hostSessionId !== lobby.hostSessionId) {
      this.state.hostSessionId = lobby.hostSessionId;
    }

    const readyToStart = isReadyToStart(lobby);
    if (readyToStart && !this.readyToStart) {
      // Marco 0.1: sem lógica de partida. Só registra que a partida poderia começar.
      console.info(`[quick_match ${this.roomId}] 4 jogadores prontos: a partida poderia iniciar.`);
    }
    this.readyToStart = readyToStart;
  }
}
