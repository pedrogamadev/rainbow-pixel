// Conexão com a sala quick_match e estado do lobby para as telas.
// Fica fora do React: a sala continua a mesma quando um componente monta de novo.

import { Client } from '@colyseus/sdk';
import { ClientMessageType, QUICK_MATCH_ROOM_NAME, ServerMessageType } from '@rainbow-pixel/shared';
import type {
  AddBotPayload,
  BotDifficultyId,
  DevNetSettings,
  LobbyErrorPayload,
  MatchCountdownMessage,
  QuickMatchJoinOptions,
  QuickMatchState,
  RemoveBotPayload,
  TeamIndex,
} from '@rainbow-pixel/shared';
import { useSyncExternalStore } from 'react';
import type { GameTransport } from '../game/GameClient';
import { clientEnv } from './env';
import { LOBBY_MESSAGES, describeJoinError } from './lobbyErrors';
import { toLobbyView } from './lobbyView';
import type { LobbyView } from './lobbyView';
import {
  clearReconnectionToken,
  loadReconnectionToken,
  saveReconnectionToken,
} from './reconnectionToken';
import { getAccessToken } from './supabase';

export type LobbyStatus = 'idle' | 'connecting' | 'joined' | 'reconnecting' | 'closed';

export interface LobbySnapshot {
  readonly status: LobbyStatus;
  /** Código da sala em que o jogador está ou tentou entrar. */
  readonly code: string | null;
  /** Estado da sala. `null` até o primeiro estado chegar. */
  readonly view: LobbyView | null;
  /** Por que a entrada falhou ou a conexão acabou. */
  readonly error: string | null;
  /** Último aviso do servidor para uma ação recusada. */
  readonly notice: string | null;
  /** Segundos até a partida começar, durante a contagem. `null` fora dela. */
  readonly countdown: number | null;
}

/** Falha ao criar ou entrar em uma sala, com mensagem em PT-BR pronta para a tela. */
export class LobbyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LobbyError';
  }
}

/**
 * Esperas antes de cada tentativa de reconectar com o token salvo. Logo depois de recarregar a
 * página, o servidor pode ainda não ter notado a queda da conexão antiga.
 */
const RECONNECT_ATTEMPT_DELAYS_MS = [0, 700, 1500] as const;

// ---------------------------------------------------------------------------
// Estado observável
// ---------------------------------------------------------------------------

const IDLE: LobbySnapshot = {
  status: 'idle',
  code: null,
  view: null,
  error: null,
  notice: null,
  countdown: null,
};

let snapshot: LobbySnapshot = IDLE;
const listeners = new Set<() => void>();

function setSnapshot(next: LobbySnapshot): void {
  snapshot = next;
  for (const listener of listeners) {
    listener();
  }
}

function patchSnapshot(patch: Partial<LobbySnapshot>): void {
  setSnapshot({ ...snapshot, ...patch });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): LobbySnapshot {
  return snapshot;
}

export function useLobby(): LobbySnapshot {
  return useSyncExternalStore(subscribe, getSnapshot);
}

// ---------------------------------------------------------------------------
// Conexão
// ---------------------------------------------------------------------------

let sdk: Client | undefined;

function getClient(): Client {
  sdk ??= new Client(clientEnv.serverWsUrl);
  return sdk;
}

/** O token do Supabase vai nas opções de entrada; o servidor valida no onAuth da sala. */
async function joinOptions(): Promise<QuickMatchJoinOptions> {
  const accessToken = await getAccessToken();
  if (accessToken === null) {
    throw new LobbyError(LOBBY_MESSAGES.invalidToken);
  }
  return { accessToken };
}

async function joinByCode(code: string) {
  return getClient().joinById<QuickMatchState>(code, await joinOptions());
}

type LobbyRoom = Awaited<ReturnType<typeof joinByCode>>;

async function createRoom(): Promise<LobbyRoom> {
  return getClient().create<QuickMatchState>(QUICK_MATCH_ROOM_NAME, await joinOptions());
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Tenta voltar para a mesma vaga com o token salvo. Devolve null se não deu. */
async function reconnectWithSavedToken(code: string): Promise<LobbyRoom | null> {
  const token = loadReconnectionToken(window.sessionStorage, code);
  if (token === null) {
    return null;
  }
  for (const delayMs of RECONNECT_ATTEMPT_DELAYS_MS) {
    if (delayMs > 0) {
      await sleep(delayMs);
    }
    try {
      return await getClient().reconnect<QuickMatchState>(token);
    } catch {
      // Token ainda não aceito ou já vencido: tenta de novo e, por fim, entra do zero.
    }
  }
  clearReconnectionToken(window.sessionStorage);
  return null;
}

// ---------------------------------------------------------------------------
// Mensagens de jogo
// O estado do jogo não vai no schema da sala: chega em mensagens `snapshot` e `pong`, ouvidas
// desde a entrada para nenhuma se perder enquanto a tela da partida ainda está montando.
// ---------------------------------------------------------------------------

const GAME_MESSAGES = [ServerMessageType.Snapshot, ServerMessageType.Pong] as const;

const gameHandlers = new Map<string, Set<(payload: unknown) => void>>();
const reconnectListeners = new Set<() => void>();

function dispatchGame(type: string, payload: unknown): void {
  for (const handler of gameHandlers.get(type) ?? []) {
    handler(payload);
  }
}

/** Conexão de jogo da sala ativa, para o GameClient. */
export interface GameSession {
  /** `playerId` deste cliente: o sessionId na sala. */
  readonly selfId: string;
  readonly transport: GameTransport;
  /** Avisa quando a conexão volta depois de uma queda (a fila do servidor recomeça). */
  onReconnect(listener: () => void): () => void;
}

export function getGameSession(): GameSession | null {
  const room = activeRoom;
  if (room === null) {
    return null;
  }
  return {
    selfId: room.sessionId,
    transport: {
      send(type, payload) {
        if (activeRoom === room) room.send(type, payload);
      },
      onMessage(type, handler) {
        const handlers = gameHandlers.get(type) ?? new Set();
        handlers.add(handler);
        gameHandlers.set(type, handlers);
        return () => {
          handlers.delete(handler);
        };
      },
    },
    onReconnect(listener) {
      reconnectListeners.add(listener);
      return () => {
        reconnectListeners.delete(listener);
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Sala ativa
// ---------------------------------------------------------------------------

let activeRoom: LobbyRoom | null = null;

/** Muda a cada pedido de entrar ou sair. Uma entrada que termina depois de outro pedido é desfeita. */
let generation = 0;

let entering: { readonly code: string; readonly promise: Promise<void> } | null = null;

function attachRoom(room: LobbyRoom): void {
  activeRoom = room;
  saveReconnectionToken(window.sessionStorage, room.reconnectionToken);
  setSnapshot({ ...IDLE, status: 'joined', code: room.roomId });

  room.onStateChange((state) => {
    if (activeRoom === room) {
      const view = toLobbyView(state, room.sessionId);
      patchSnapshot(view.phase === 'match' ? { view, countdown: null } : { view });
    }
  });

  room.onMessage<LobbyErrorPayload>(ServerMessageType.LobbyError, (payload) => {
    if (activeRoom === room) {
      patchSnapshot({ notice: payload.message });
    }
  });

  room.onMessage<MatchCountdownMessage>(ServerMessageType.MatchCountdown, (payload) => {
    if (activeRoom === room) {
      patchSnapshot({ countdown: payload.secondsLeft });
    }
  });

  for (const type of GAME_MESSAGES) {
    room.onMessage<unknown>(type, (payload) => {
      if (activeRoom === room) {
        dispatchGame(type, payload);
      }
    });
  }

  // Queda de conexão: o SDK tenta voltar sozinho e avisa em onReconnect ou onLeave.
  room.onDrop(() => {
    if (activeRoom === room) {
      patchSnapshot({ status: 'reconnecting' });
    }
  });

  room.onReconnect(() => {
    if (activeRoom !== room) {
      return;
    }
    patchSnapshot({ status: 'joined' });
    for (const listener of reconnectListeners) {
      listener();
    }
    // O SDK só troca o token depois de avisar os ouvintes.
    queueMicrotask(() => {
      if (activeRoom === room) {
        saveReconnectionToken(window.sessionStorage, room.reconnectionToken);
      }
    });
  });

  room.onError((code, message) => {
    console.warn(`[lobby] erro da sala (${code}): ${message ?? ''}`);
  });

  // Saída que o jogador não pediu (em leaveLobby a sala deixa de ser a ativa antes de sair).
  // O token salvo continua valendo para tentar voltar.
  room.onLeave(() => {
    if (activeRoom !== room) {
      return;
    }
    activeRoom = null;
    setSnapshot({
      ...IDLE,
      status: 'closed',
      code: room.roomId,
      error: LOBBY_MESSAGES.connectionLost,
    });
  });
}

/** Sai da sala ativa, se houver, sem mexer no estado observável. */
async function detachActiveRoom(): Promise<void> {
  const room = activeRoom;
  activeRoom = null;
  clearReconnectionToken(window.sessionStorage);
  if (room === null) {
    return;
  }
  try {
    await room.leave();
  } catch {
    // A sala já tinha fechado.
  }
}

function toLobbyError(error: unknown): LobbyError {
  return error instanceof LobbyError ? error : new LobbyError(describeJoinError(error));
}

/** Uma entrada que perdeu a vez (o jogador saiu ou pediu outra sala) larga a sala recém-aberta. */
function discardIfStale(room: LobbyRoom, startedAt: number): boolean {
  if (startedAt === generation) {
    return false;
  }
  void room.leave().catch(() => {});
  return true;
}

/** Cria uma sala nova e entra nela como host. Devolve o código da sala. */
export async function createLobby(): Promise<string> {
  generation += 1;
  const startedAt = generation;
  await detachActiveRoom();
  setSnapshot({ ...IDLE, status: 'connecting' });

  let room: LobbyRoom;
  try {
    room = await createRoom();
  } catch (error) {
    if (startedAt === generation) {
      setSnapshot(IDLE);
    }
    throw toLobbyError(error);
  }
  if (discardIfStale(room, startedAt)) {
    throw new LobbyError(LOBBY_MESSAGES.joinFailed);
  }
  attachRoom(room);
  return room.roomId;
}

async function enter(code: string): Promise<void> {
  generation += 1;
  const startedAt = generation;
  // Um token de reconexão desta mesma sala precisa sobreviver até a tentativa logo abaixo.
  const savedToken = loadReconnectionToken(window.sessionStorage, code);
  await detachActiveRoom();
  if (savedToken !== null) {
    saveReconnectionToken(window.sessionStorage, savedToken);
  }
  setSnapshot({ ...IDLE, status: 'connecting', code });

  let room: LobbyRoom;
  try {
    room = (await reconnectWithSavedToken(code)) ?? (await joinByCode(code));
  } catch (error) {
    const lobbyError = toLobbyError(error);
    if (startedAt === generation) {
      setSnapshot({ ...IDLE, status: 'closed', code, error: lobbyError.message });
    }
    throw lobbyError;
  }
  if (discardIfStale(room, startedAt)) {
    throw new LobbyError(LOBBY_MESSAGES.joinFailed);
  }
  attachRoom(room);
}

/**
 * Garante que o jogador está na sala `code`: aproveita a conexão ativa, tenta reconectar com o
 * token salvo (página recarregada) ou entra pelo código.
 * Chamadas repetidas para a mesma sala dividem a mesma tentativa.
 */
export function enterLobby(code: string): Promise<void> {
  if (activeRoom !== null && activeRoom.roomId === code) {
    return Promise.resolve();
  }
  if (entering !== null && entering.code === code) {
    return entering.promise;
  }
  const promise = enter(code).finally(() => {
    if (entering?.promise === promise) {
      entering = null;
    }
  });
  entering = { code, promise };
  return promise;
}

/** Saída definitiva: a vaga é liberada e o token de reconexão é descartado. */
export async function leaveLobby(): Promise<void> {
  generation += 1;
  entering = null;
  if (snapshot !== IDLE) {
    setSnapshot(IDLE);
  }
  await detachActiveRoom();
}

// ---------------------------------------------------------------------------
// Ações do lobby
// ---------------------------------------------------------------------------

export function toggleReady(): void {
  activeRoom?.send(ClientMessageType.ToggleReady);
}

export function addBot(team: TeamIndex, difficulty: BotDifficultyId): void {
  const payload: AddBotPayload = { team, difficulty };
  activeRoom?.send(ClientMessageType.AddBot, payload);
}

export function removeBot(playerId: string): void {
  const payload: RemoveBotPayload = { playerId };
  activeRoom?.send(ClientMessageType.RemoveBot, payload);
}

/** Somente o host: a sala volta para o lobby. */
export function endMatch(): void {
  activeRoom?.send(ClientMessageType.EndMatch);
}

/** Ferramenta de teste: o host inicia a partida com quem estiver na sala. */
export function forceStartMatch(): void {
  activeRoom?.send(ClientMessageType.DevForceStart);
}

/** Ferramenta de teste: troca o simulador de lag deste cliente no servidor. */
export function setDevNet(settings: DevNetSettings): void {
  activeRoom?.send(ClientMessageType.DevSetNet, settings);
}

export function dismissLobbyNotice(): void {
  if (snapshot.notice !== null) {
    patchSnapshot({ notice: null });
  }
}
