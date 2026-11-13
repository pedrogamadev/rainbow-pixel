// Conexão com a sala quick_match e estado do lobby para as telas.
// Fica fora do React: a sala continua a mesma quando um componente monta de novo.

import { Client } from '@colyseus/sdk';
import { ClientMessageType, QUICK_MATCH_ROOM_NAME, ServerMessageType } from '@rainbow-pixel/shared';
import type {
  AddBotPayload,
  BotDifficultyId,
  LobbyErrorPayload,
  QuickMatchJoinOptions,
  QuickMatchState,
  RemoveBotPayload,
  TeamIndex,
} from '@rainbow-pixel/shared';
import { useSyncExternalStore } from 'react';
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

const IDLE: LobbySnapshot = { status: 'idle', code: null, view: null, error: null, notice: null };

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
// Sala ativa
// ---------------------------------------------------------------------------

let activeRoom: LobbyRoom | null = null;

/** Muda a cada pedido de entrar ou sair. Uma entrada que termina depois de outro pedido é desfeita. */
let generation = 0;

let entering: { readonly code: string; readonly promise: Promise<void> } | null = null;

function attachRoom(room: LobbyRoom): void {
  activeRoom = room;
  saveReconnectionToken(window.sessionStorage, room.reconnectionToken);
  setSnapshot({ status: 'joined', code: room.roomId, view: null, error: null, notice: null });

  room.onStateChange((state) => {
    if (activeRoom === room) {
      patchSnapshot({ view: toLobbyView(state, room.sessionId) });
    }
  });

  room.onMessage<LobbyErrorPayload>(ServerMessageType.LobbyError, (payload) => {
    if (activeRoom === room) {
      patchSnapshot({ notice: payload.message });
    }
  });

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
      status: 'closed',
      code: room.roomId,
      view: null,
      error: LOBBY_MESSAGES.connectionLost,
      notice: null,
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

export function dismissLobbyNotice(): void {
  if (snapshot.notice !== null) {
    patchSnapshot({ notice: null });
  }
}
