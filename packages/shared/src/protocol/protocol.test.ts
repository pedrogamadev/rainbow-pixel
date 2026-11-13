import { describe, expect, it } from 'vitest';
import { MATCH_CONFIG } from '../config/index.js';
import {
  ClientMessageType,
  JoinErrorCode,
  LOBBY_ERROR_MESSAGES,
  QUICK_MATCH_ROOM_NAME,
  ServerMessageType,
  TEAM_INDEXES,
} from './index.js';

describe('protocolo da sala quick_match', () => {
  it('usa o nome de sala registrado no servidor', () => {
    expect(QUICK_MATCH_ROOM_NAME).toBe('quick_match');
  });

  it('tem um índice por time', () => {
    expect(TEAM_INDEXES).toHaveLength(MATCH_CONFIG.teamCount);
  });

  it('usa os nomes de mensagem do marco', () => {
    expect(ClientMessageType).toEqual({
      ToggleReady: 'toggle_ready',
      AddBot: 'add_bot',
      RemoveBot: 'remove_bot',
    });
    expect(ServerMessageType.LobbyError).toBe('lobby_error');
  });

  it('não repete códigos de erro de entrada', () => {
    const codes = Object.values(JoinErrorCode);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('tem mensagem para cada erro de lobby', () => {
    for (const message of Object.values(LOBBY_ERROR_MESSAGES)) {
      expect(message.length).toBeGreaterThan(0);
    }
  });
});
