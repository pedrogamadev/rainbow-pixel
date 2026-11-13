// Regras de vagas, times e bots do lobby, em funções puras.
// Nenhuma função altera o lobby recebido: todas devolvem um lobby novo.

import {
  BOT_PLAYER_ID_PREFIX,
  LOBBY_CONFIG,
  MATCH_CONFIG,
  TEAM_INDEXES,
  getBotDifficulty,
} from '@rainbow-pixel/shared';
import type {
  BotDifficultyId,
  LobbyErrorCode,
  LobbyPlayerKind,
  TeamIndex,
} from '@rainbow-pixel/shared';

export interface LobbySlot {
  /** sessionId para humano, `bot:<n>` para bot. */
  readonly playerId: string;
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

export interface LobbyState {
  /** Jogadores na ordem em que entraram. */
  readonly players: readonly LobbySlot[];
  /** sessionId do host. Vazio enquanto não há humano. */
  readonly hostSessionId: string;
}

export interface LobbyFailure {
  readonly ok: false;
  readonly error: LobbyErrorCode;
}

export type LobbyResult = { readonly ok: true; readonly lobby: LobbyState } | LobbyFailure;

export type AddHumanResult =
  | {
      readonly ok: true;
      readonly lobby: LobbyState;
      /** Bot que cedeu a vaga para o humano, se houve. */
      readonly replacedBotId: string | null;
    }
  | LobbyFailure;

export type AddBotResult =
  { readonly ok: true; readonly lobby: LobbyState; readonly botId: string } | LobbyFailure;

export interface RemovePlayerResult {
  readonly lobby: LobbyState;
  readonly removed: boolean;
  /** A sala ficou sem humano e precisa ser descartada. */
  readonly shouldDispose: boolean;
}

export interface HumanJoin {
  readonly sessionId: string;
  readonly profileId: string;
  readonly nickname: string;
}

export interface BotRequest {
  readonly team: TeamIndex;
  readonly difficulty: BotDifficultyId;
}

function fail(error: LobbyErrorCode): LobbyFailure {
  return { ok: false, error };
}

export function createLobby(): LobbyState {
  return { players: [], hostSessionId: '' };
}

export function findPlayer(lobby: LobbyState, playerId: string): LobbySlot | undefined {
  return lobby.players.find((player) => player.playerId === playerId);
}

export function countHumans(lobby: LobbyState): number {
  return lobby.players.filter((player) => player.kind === 'human').length;
}

export function countBots(lobby: LobbyState): number {
  return lobby.players.filter((player) => player.kind === 'bot').length;
}

/** Conta humanos e bots do time. */
export function countTeam(lobby: LobbyState, team: TeamIndex): number {
  return lobby.players.filter((player) => player.team === team).length;
}

/** Time com menos jogadores. No empate, o de menor índice. */
function pickTeam(players: readonly LobbySlot[]): TeamIndex {
  let best: TeamIndex = TEAM_INDEXES[0];
  let bestCount = Number.POSITIVE_INFINITY;
  for (const team of TEAM_INDEXES) {
    const count = players.filter((player) => player.team === team).length;
    if (count < bestCount) {
      best = team;
      bestCount = count;
    }
  }
  return best;
}

/** Próximo host: o humano mais antigo, de preferência um que esteja conectado. */
function pickHost(players: readonly LobbySlot[]): string {
  const humans = players.filter((player) => player.kind === 'human');
  const next = humans.find((player) => player.connected) ?? humans[0];
  return next?.playerId ?? '';
}

function replacePlayer(lobby: LobbyState, updated: LobbySlot): LobbyState {
  return {
    ...lobby,
    players: lobby.players.map((player) =>
      player.playerId === updated.playerId ? updated : player,
    ),
  };
}

/**
 * Coloca um humano na sala, no time com menos jogadores.
 * Com a sala cheia, o último bot adicionado sai antes de o humano receber a vaga.
 */
export function addHuman(lobby: LobbyState, join: HumanJoin): AddHumanResult {
  const alreadyIn = lobby.players.some(
    (player) =>
      player.playerId === join.sessionId ||
      (player.kind === 'human' && player.profileId === join.profileId),
  );
  if (alreadyIn) {
    return fail('already_in_room');
  }

  let players = lobby.players;
  let replacedBotId: string | null = null;
  if (players.length >= MATCH_CONFIG.maxPlayers) {
    const lastBot = players.findLast((player) => player.kind === 'bot');
    if (lastBot === undefined) {
      return fail('room_full');
    }
    replacedBotId = lastBot.playerId;
    players = players.filter((player) => player.playerId !== lastBot.playerId);
  }

  const human: LobbySlot = {
    playerId: join.sessionId,
    kind: 'human',
    profileId: join.profileId,
    nickname: join.nickname,
    team: pickTeam(players),
    ready: false,
    connected: true,
    botDifficulty: '',
  };

  return {
    ok: true,
    lobby: {
      players: [...players, human],
      hostSessionId: lobby.hostSessionId === '' ? join.sessionId : lobby.hostSessionId,
    },
    replacedBotId,
  };
}

/**
 * Tira um jogador da sala (saída definitiva de humano).
 * Se o host sair, o próximo humano vira host. Sem humano, a sala é descartada junto com os bots.
 */
export function removePlayer(lobby: LobbyState, playerId: string): RemovePlayerResult {
  const removed = findPlayer(lobby, playerId) !== undefined;
  const players = lobby.players.filter((player) => player.playerId !== playerId);

  if (!players.some((player) => player.kind === 'human')) {
    return { lobby: createLobby(), removed, shouldDispose: true };
  }

  const hostStillHere = players.some((player) => player.playerId === lobby.hostSessionId);
  return {
    lobby: {
      players,
      hostSessionId: hostStillHere ? lobby.hostSessionId : pickHost(players),
    },
    removed,
    shouldDispose: false,
  };
}

/** Marca um humano como conectado ou desconectado. A vaga e o time continuam dele. */
export function setConnected(lobby: LobbyState, sessionId: string, connected: boolean): LobbyState {
  const player = findPlayer(lobby, sessionId);
  if (player === undefined || player.kind !== 'human' || player.connected === connected) {
    return lobby;
  }
  return replacePlayer(lobby, { ...player, connected });
}

export function toggleReady(lobby: LobbyState, sessionId: string): LobbyResult {
  const player = findPlayer(lobby, sessionId);
  if (player === undefined || player.kind !== 'human') {
    return fail('player_not_found');
  }
  return { ok: true, lobby: replacePlayer(lobby, { ...player, ready: !player.ready }) };
}

function isHost(lobby: LobbyState, sessionId: string): boolean {
  return lobby.hostSessionId !== '' && lobby.hostSessionId === sessionId;
}

/** Menor número livre para o próximo bot (`bot:<n>`). */
function nextBotNumber(lobby: LobbyState): number {
  let number = 1;
  while (findPlayer(lobby, `${BOT_PLAYER_ID_PREFIX}${number}`) !== undefined) {
    number += 1;
  }
  return number;
}

/** Só o host adiciona bot. O bot já entra pronto e conectado. */
export function addBot(
  lobby: LobbyState,
  actorSessionId: string,
  request: BotRequest,
): AddBotResult {
  if (!isHost(lobby, actorSessionId)) {
    return fail('not_host');
  }
  if (countBots(lobby) >= LOBBY_CONFIG.maxBots) {
    return fail('max_bots');
  }
  if (lobby.players.length >= MATCH_CONFIG.maxPlayers) {
    return fail('room_full');
  }
  if (countTeam(lobby, request.team) >= MATCH_CONFIG.teamSize) {
    return fail('team_full');
  }

  const number = nextBotNumber(lobby);
  const bot: LobbySlot = {
    playerId: `${BOT_PLAYER_ID_PREFIX}${number}`,
    kind: 'bot',
    profileId: '',
    nickname: `BOT ${getBotDifficulty(request.difficulty).name} ${number}`,
    team: request.team,
    ready: true,
    connected: true,
    botDifficulty: request.difficulty,
  };

  return {
    ok: true,
    lobby: { ...lobby, players: [...lobby.players, bot] },
    botId: bot.playerId,
  };
}

/** Só o host remove bot. */
export function removeBot(
  lobby: LobbyState,
  actorSessionId: string,
  playerId: string,
): LobbyResult {
  if (!isHost(lobby, actorSessionId)) {
    return fail('not_host');
  }
  const bot = findPlayer(lobby, playerId);
  if (bot === undefined || bot.kind !== 'bot') {
    return fail('bot_not_found');
  }
  return {
    ok: true,
    lobby: {
      ...lobby,
      players: lobby.players.filter((player) => player.playerId !== playerId),
    },
  };
}

/** Sala fechada em 2v2, com todos prontos e conectados. */
export function isReadyToStart(lobby: LobbyState): boolean {
  return (
    lobby.players.length === MATCH_CONFIG.maxPlayers &&
    lobby.players.every((player) => player.ready && player.connected)
  );
}
