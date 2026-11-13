import { JoinErrorCode } from '@rainbow-pixel/shared';
import { describe, expect, it } from 'vitest';
import { LOBBY_MESSAGES, describeJoinError } from './lobbyErrors';

describe('describeJoinError', () => {
  it('traduz as recusas do servidor ao entrar na sala', () => {
    expect(describeJoinError({ code: JoinErrorCode.InvalidToken, message: 'x' })).toBe(
      LOBBY_MESSAGES.invalidToken,
    );
    expect(describeJoinError({ code: JoinErrorCode.ProfileNotFound, message: 'x' })).toBe(
      LOBBY_MESSAGES.profileNotFound,
    );
    expect(describeJoinError({ code: JoinErrorCode.AlreadyInRoom, message: 'x' })).toBe(
      LOBBY_MESSAGES.alreadyInRoom,
    );
    expect(describeJoinError({ code: JoinErrorCode.RoomFull, message: 'x' })).toBe(
      LOBBY_MESSAGES.roomFull,
    );
  });

  it('diferencia sala inexistente de sala trancada por estar cheia', () => {
    expect(describeJoinError({ code: 522, message: 'room "ABC234" not found' })).toBe(
      LOBBY_MESSAGES.roomNotFound,
    );
    expect(describeJoinError({ code: 522, message: 'room "ABC234" is locked' })).toBe(
      LOBBY_MESSAGES.roomFull,
    );
    expect(describeJoinError({ code: 404 })).toBe(LOBBY_MESSAGES.roomNotFound);
  });

  it('trata erro sem código numérico como servidor fora do ar', () => {
    expect(describeJoinError(new Error('fetch failed'))).toBe(LOBBY_MESSAGES.serverUnavailable);
    expect(describeJoinError({ code: 'ECONNREFUSED' })).toBe(LOBBY_MESSAGES.serverUnavailable);
    expect(describeJoinError(undefined)).toBe(LOBBY_MESSAGES.serverUnavailable);
    expect(describeJoinError('falhou')).toBe(LOBBY_MESSAGES.serverUnavailable);
  });

  it('usa a mensagem genérica para código desconhecido', () => {
    expect(describeJoinError({ code: 500, message: 'x' })).toBe(LOBBY_MESSAGES.joinFailed);
  });
});
