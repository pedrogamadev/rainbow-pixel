import { schema, t } from '@colyseus/schema';
import type { SchemaType } from '@colyseus/schema';
import { getMap } from '@rainbow-pixel/maps';
import {
  ClientMessageType,
  DEV_NET_SIMULATOR_CONFIG,
  JoinErrorCode,
  LOBBY_CONFIG,
  LOBBY_ERROR_MESSAGES,
  MATCH_CONFIG,
  NET_CONFIG,
  SIM_CONFIG,
  ServerMessageType,
  TEAM_INDEXES,
  isBotDifficultyId,
} from '@rainbow-pixel/shared';
import type {
  BotDifficultyId,
  DevNetSettings,
  LobbyErrorCode,
  LobbyErrorPayload,
  MatchCountdownMessage,
  PongMessage,
  TeamIndex,
} from '@rainbow-pixel/shared';
import { Room, ServerError, matchMaker } from 'colyseus';
import type { Client, Deferred, Delayed } from 'colyseus';
import { z } from 'zod';
import { describeAuthFailure } from '../auth/verifyJwt.js';
import type { VerifyJwt } from '../auth/verifyJwt.js';
import type { ProfileStore } from '../db/profiles.js';
import { NetSimulator } from '../dev/netSimulator.js';
import { MatchSimulation } from '../match/MatchSimulation.js';
import {
  addBot,
  addHuman,
  countConnectedHumans,
  createLobby,
  endMatch,
  findPlayer,
  isReadyToStart,
  removeBot,
  removePlayer,
  setConnected,
  startMatch,
  toggleReady,
} from './lobbySlots.js';
import type { LobbyFailure, LobbyState } from './lobbySlots.js';
import { generateUniqueRoomCode } from './roomCode.js';

// ---------------------------------------------------------------------------
// Estado sincronizado (espelha QuickMatchState de packages/shared)
// O lobby fica no schema; o estado do jogo vai em mensagens `snapshot` montadas por cliente.
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
    phase: t.string().default('lobby'),
    mapId: t.string().default(''),
    matchStartedAt: t.float64().default(0),
  },
  'QuickMatchRoomState',
);
export type QuickMatchRoomState = SchemaType<typeof QuickMatchRoomState>;

// ---------------------------------------------------------------------------
// Dependências e autenticação
// ---------------------------------------------------------------------------

export interface DevToolsOptions {
  /** DEV_TOOLS=true: início forçado e simulador de lag. */
  readonly enabled: boolean;
  /** Valores iniciais do simulador de lag de cada cliente. */
  readonly netDefaults: DevNetSettings;
}

export interface QuickMatchRoomDependencies {
  readonly verifyJwt: VerifyJwt;
  readonly profiles: ProfileStore;
  readonly devTools: DevToolsOptions;
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

function requireDependencies(): QuickMatchRoomDependencies {
  if (dependencies === undefined) {
    throw new Error('QuickMatchRoom usada antes de configureQuickMatchRoom().');
  }
  return dependencies;
}

/** Relógio do servidor: ms desde 1970, sem voltar no tempo. Vai nos snapshots e pongs. */
function serverNow(): number {
  return performance.timeOrigin + performance.now();
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

/** Cada input é validado na fila (match/inputQueue.ts); aqui só a forma da mensagem. */
const inputMessageSchema = z.object({
  inputs: z.array(z.unknown()).max(NET_CONFIG.inputQueueMax),
});

const pingSchema = z.object({ clientTimeMs: z.number() });

const devNetSchema = z.object({
  latencyMs: z.number().min(0).max(DEV_NET_SIMULATOR_CONFIG.maxLatencyMs),
  jitterMs: z.number().min(0).max(DEV_NET_SIMULATOR_CONFIG.maxJitterMs),
  lossPct: z.number().min(0).max(DEV_NET_SIMULATOR_CONFIG.maxLossPct),
});

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
  switch (error) {
    case 'already_in_room':
      return JoinErrorCode.AlreadyInRoom;
    case 'match_in_progress':
      return JoinErrorCode.MatchInProgress;
    default:
      return JoinErrorCode.RoomFull;
  }
}

// ---------------------------------------------------------------------------
// Sala
// ---------------------------------------------------------------------------

/**
 * Partida rápida: o lobby e a partida acontecem na mesma sala, em fases (`lobby` e `match`),
 * preservando código, host e reconexão.
 */
export class QuickMatchRoom extends Room<{ state: QuickMatchRoomState; client: RoomClient }> {
  // Conta só humanos: bot não é cliente e não ocupa conexão. Cada humano pode ter, por um
  // instante, duas conexões: a vaga desconectada reservada para reconexão e a aba nova que vai
  // assumi-la. Por isso o limite do Colyseus é o dobro; quem limita os humanos a 4 é lobbySlots.
  override maxClients = MATCH_CONFIG.maxPlayers * 2;
  override state = new QuickMatchRoomState();

  /** Fonte da verdade do lobby. O estado sincronizado é só um espelho dela. */
  private lobby: LobbyState = createLobby();
  /** Reservas de reconexão das vagas desconectadas, por sessionId. */
  private readonly reconnections = new Map<string, Deferred<RoomClient>>();
  private match: MatchSimulation | null = null;
  private countdown: { readonly timer: Delayed; secondsLeft: number } | null = null;
  /** Simulador de lag. Só existe com DEV_TOOLS=true. */
  private net: NetSimulator | null = null;
  private devTools = false;

  /**
   * Roda no matchmaking, antes de a sala ser criada ou de a vaga ser reservada.
   * A identidade vem só do JWT; nenhum id enviado pelo cliente é usado.
   */
  static override async onAuth(_token: string, options: unknown): Promise<RoomAuth> {
    const { verifyJwt, profiles } = requireDependencies();

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
    const { devTools } = requireDependencies();
    this.devTools = devTools.enabled;
    if (devTools.enabled) {
      this.net = new NetSimulator(devTools.netDefaults, Math.random);
    }

    const code = await generateUniqueRoomCode(isRoomCodeTaken);
    this.roomId = code;
    this.state.code = code;

    this.onMessage(ClientMessageType.ToggleReady, (client) => {
      // Durante a partida, toggleReady devolve o lobby sem mudança.
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

    this.onMessage<unknown>(ClientMessageType.Input, (client, message) => {
      const payload = inputMessageSchema.safeParse(message);
      if (this.match === null || !payload.success) {
        return;
      }
      const inputs = payload.data.inputs.slice(-NET_CONFIG.inputRedundancy);
      const { sessionId } = client;
      this.receive(sessionId, () => {
        this.match?.enqueueInputs(sessionId, inputs, serverNow());
      });
    });

    this.onMessage<unknown>(ClientMessageType.Ping, (client, message) => {
      const payload = pingSchema.safeParse(message);
      if (!payload.success) {
        return;
      }
      const pong: PongMessage = {
        clientTimeMs: payload.data.clientTimeMs,
        serverTimeMs: serverNow(),
      };
      this.deliver(client, () => client.send(ServerMessageType.Pong, pong));
    });

    this.onMessage(ClientMessageType.EndMatch, (client) => {
      if (client.sessionId !== this.lobby.hostSessionId) {
        this.sendLobbyError(client, 'not_host');
        return;
      }
      if (this.lobby.phase === 'match') {
        this.endMatch('o host encerrou');
      }
    });

    this.onMessage(ClientMessageType.DevForceStart, (client) => {
      if (!this.devTools) {
        this.sendLobbyError(client, 'dev_tools_disabled');
        return;
      }
      if (client.sessionId !== this.lobby.hostSessionId) {
        this.sendLobbyError(client, 'not_host');
        return;
      }
      if (this.lobby.phase === 'match') {
        this.sendLobbyError(client, 'match_in_progress');
        return;
      }
      this.startMatch('início forçado pelo host (DEV_TOOLS)');
    });

    this.onMessage<unknown>(ClientMessageType.DevSetNet, (client, message) => {
      if (this.net === null) {
        this.sendLobbyError(client, 'dev_tools_disabled');
        return;
      }
      const payload = devNetSchema.safeParse(message);
      if (!payload.success) {
        this.sendLobbyError(client, 'invalid_payload');
        return;
      }
      this.net.setSettings(client.sessionId, payload.data);
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
    if (result.resumedPlayerId !== null) {
      // A aba nova assume a mesma entidade da partida, com o id da sessão nova.
      this.match?.renamePlayer(result.resumedPlayerId, client.sessionId);
      this.net?.dropClient(result.resumedPlayerId);
    }
    this.setLobby(result.lobby);
    if (result.resumedPlayerId !== null) {
      // A vaga já é da sessão nova. O Colyseus chama onLeave da sessão antiga, que não acha
      // mais vaga com aquele id e não mexe no lobby.
      this.cancelReconnection(result.resumedPlayerId);
    }
  }

  /** Queda de conexão: a vaga fica reservada pela janela de reconexão. */
  override onDrop(client: RoomClient): void {
    // Uma entrada recusada no onJoin também passa por aqui, sem vaga no lobby.
    if (findPlayer(this.lobby, client.sessionId) === undefined) {
      return;
    }
    const { sessionId } = client;
    this.net?.dropClient(sessionId);
    this.match?.setConnected(sessionId, false);
    this.setLobby(setConnected(this.lobby, sessionId, false));
    const reconnection = this.allowReconnection(client, LOBBY_CONFIG.reconnectionWindowSeconds);
    this.reconnections.set(sessionId, reconnection);
    const forget = () => {
      if (this.reconnections.get(sessionId) === reconnection) {
        this.reconnections.delete(sessionId);
      }
    };
    // Se o prazo vencer (ou a vaga for retomada por outra aba), o Colyseus chama onLeave.
    reconnection.then(forget, forget);
  }

  override onReconnect(client: RoomClient): void {
    // O cliente que volta numera os inputs do zero: a fila dele recomeça.
    this.match?.setConnected(client.sessionId, true);
    this.setLobby(setConnected(this.lobby, client.sessionId, true));
  }

  /** Saída definitiva: o jogador sai da lista. Sem humano, a sala é descartada pelo autoDispose. */
  override onLeave(client: RoomClient): void {
    this.net?.dropClient(client.sessionId);
    const result = removePlayer(this.lobby, client.sessionId);
    if (result.removed) {
      this.match?.removePlayer(client.sessionId);
      this.setLobby(result.lobby);
    }
  }

  override onDispose(): void {
    reservedCodes.delete(this.roomId);
    this.net?.dispose();
  }

  /** Desiste de esperar a reconexão de uma sessão. */
  private cancelReconnection(sessionId: string): void {
    const reconnection = this.reconnections.get(sessionId);
    this.reconnections.delete(sessionId);
    // Com a sala fechando, allowReconnection devolve uma Promise comum, sem reject.
    if (reconnection !== undefined && typeof reconnection.reject === 'function') {
      reconnection.reject(false);
    }
  }

  // -------------------------------------------------------------------------
  // Fases
  // -------------------------------------------------------------------------

  /** Todos prontos: espera a contagem e inicia, se a condição continuar valendo. */
  private startCountdown(): void {
    const secondsLeft = MATCH_CONFIG.startCountdownSeconds;
    const timer = this.clock.setInterval(() => {
      if (this.countdown === null) return;
      this.countdown.secondsLeft -= 1;
      if (this.countdown.secondsLeft > 0) {
        this.broadcastCountdown(this.countdown.secondsLeft);
        return;
      }
      this.countdown.timer.clear();
      this.countdown = null;
      if (isReadyToStart(this.lobby)) {
        this.startMatch('4 jogadores prontos');
      }
    }, 1000);
    this.countdown = { timer, secondsLeft };
    this.broadcastCountdown(secondsLeft);
  }

  private cancelCountdown(): void {
    if (this.countdown === null) return;
    this.countdown.timer.clear();
    this.countdown = null;
    this.broadcastCountdown(null);
  }

  private broadcastCountdown(secondsLeft: number | null): void {
    const message: MatchCountdownMessage = { secondsLeft };
    this.broadcast(ServerMessageType.MatchCountdown, message);
  }

  private startMatch(reason: string): void {
    if (this.countdown !== null) {
      this.countdown.timer.clear();
      this.countdown = null;
    }
    const map = getMap(MATCH_CONFIG.mapId);
    const match = new MatchSimulation({
      map,
      players: this.lobby.players.map((player) => ({
        playerId: player.playerId,
        team: player.team,
        kind: player.kind,
      })),
      startMs: serverNow(),
    });
    for (const player of this.lobby.players) {
      if (!player.connected) match.setConnected(player.playerId, false);
    }
    this.match = match;
    this.state.mapId = map.id;
    this.state.matchStartedAt = Date.now();
    this.setLobby(startMatch(this.lobby));
    this.setTimestep(() => this.runMatchFrame(), SIM_CONFIG.serverLoopIntervalMs);
    console.info(`[quick_match ${this.roomId}] partida iniciada no ${map.id} (${reason}).`);
  }

  private endMatch(reason: string): void {
    this.setTimestep();
    this.match = null;
    this.state.mapId = '';
    this.state.matchStartedAt = 0;
    this.setLobby(endMatch(this.lobby));
    console.info(`[quick_match ${this.roomId}] partida encerrada (${reason}).`);
  }

  private runMatchFrame(): void {
    const match = this.match;
    if (match === null) return;
    if (!match.advance(serverNow()).snapshotDue) return;
    const isConnected = (playerId: string) => findPlayer(this.lobby, playerId)?.connected ?? false;
    for (const client of this.clients) {
      const snapshot = match.snapshotFor(client.sessionId, isConnected);
      this.deliver(client, () => client.send(ServerMessageType.Snapshot, snapshot));
    }
  }

  /** Mensagem recebida que passa pelo simulador de lag (input). */
  private receive(sessionId: string, handle: () => void): void {
    if (this.net === null) handle();
    else this.net.incoming(sessionId, handle);
  }

  /** Mensagem enviada que passa pelo simulador de lag (snapshot, pong). */
  private deliver(client: RoomClient, send: () => void): void {
    if (this.net === null) send();
    else this.net.outgoing(client.sessionId, send);
  }

  // -------------------------------------------------------------------------
  // Lobby
  // -------------------------------------------------------------------------

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

  /** Guarda o lobby novo, copia para o estado sincronizado só o que mudou e segue as fases. */
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
    if (this.state.phase !== lobby.phase) {
      this.state.phase = lobby.phase;
    }

    // Todos os humanos caíram (ou a sala esvaziou): a partida acaba e a sala volta para o lobby.
    if (this.match !== null && (lobby.phase !== 'match' || countConnectedHumans(lobby) === 0)) {
      this.endMatch('nenhum humano conectado');
      return;
    }
    if (lobby.phase === 'match') {
      return;
    }
    const ready = isReadyToStart(lobby);
    if (ready && this.countdown === null) {
      this.startCountdown();
    } else if (!ready && this.countdown !== null) {
      this.cancelCountdown();
    }
  }
}
