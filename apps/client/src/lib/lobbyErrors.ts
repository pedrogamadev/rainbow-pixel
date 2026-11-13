// Mensagens em PT-BR para as falhas ao criar ou entrar em uma sala.

import { JoinErrorCode } from '@rainbow-pixel/shared';

/**
 * Código do Colyseus (MATCHMAKE_INVALID_ROOM_ID) para sala que não existe e também para
 * sala trancada por estar cheia. A mensagem diz qual dos dois casos é.
 */
const MATCHMAKE_INVALID_ROOM_ID = 522;

export const LOBBY_MESSAGES = {
  invalidToken: 'Sessão inválida ou expirada. Faça login de novo.',
  profileNotFound: 'Crie seu perfil antes de entrar em uma sala.',
  alreadyInRoom:
    'Você já está nesta sala em outra aba ou conexão. Feche a outra ou tente de novo em instantes.',
  roomFull: 'A sala está cheia.',
  roomNotFound: 'Sala não encontrada. Confira o código.',
  serverUnavailable:
    'Não foi possível falar com o servidor. Verifique sua conexão e tente de novo.',
  joinFailed: 'Não foi possível entrar na sala. Tente de novo.',
  connectionLost: 'A conexão com a sala caiu.',
} as const;

function readField(error: unknown, field: 'code' | 'message'): unknown {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }
  return (error as Record<string, unknown>)[field];
}

/** Traduz o erro do SDK do Colyseus ao criar, entrar ou reconectar. */
export function describeJoinError(error: unknown): string {
  const code = readField(error, 'code');
  const message = readField(error, 'message');

  // Falha de rede não traz código numérico do servidor.
  if (typeof code !== 'number') {
    return LOBBY_MESSAGES.serverUnavailable;
  }

  switch (code) {
    case JoinErrorCode.InvalidToken:
      return LOBBY_MESSAGES.invalidToken;
    case JoinErrorCode.ProfileNotFound:
      return LOBBY_MESSAGES.profileNotFound;
    case JoinErrorCode.AlreadyInRoom:
      return LOBBY_MESSAGES.alreadyInRoom;
    case JoinErrorCode.RoomFull:
      return LOBBY_MESSAGES.roomFull;
    case MATCHMAKE_INVALID_ROOM_ID:
    case 404:
      return typeof message === 'string' && message.includes('locked')
        ? LOBBY_MESSAGES.roomFull
        : LOBBY_MESSAGES.roomNotFound;
    default:
      return LOBBY_MESSAGES.joinFailed;
  }
}
