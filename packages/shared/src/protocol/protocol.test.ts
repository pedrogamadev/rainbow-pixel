import { describe, expect, it } from 'vitest';
import { MATCH_CONFIG } from '../config/index.js';
import {
  ClientMessageType,
  JoinErrorCode,
  LOBBY_ERROR_MESSAGES,
  MATCH_PHASES,
  QUICK_MATCH_ROOM_NAME,
  ServerMessageType,
} from './index.js';
import { TEAM_INDEXES } from '../sim/types.js';

describe('protocolo da sala quick_match', () => {
  it('usa o nome de sala registrado no servidor', () => {
    expect(QUICK_MATCH_ROOM_NAME).toBe('quick_match');
  });

  it('tem um índice por time', () => {
    expect(TEAM_INDEXES).toHaveLength(MATCH_CONFIG.teamCount);
  });

  it('usa os nomes de mensagem dos marcos', () => {
    expect(ClientMessageType).toEqual({
      ToggleReady: 'toggle_ready',
      AddBot: 'add_bot',
      RemoveBot: 'remove_bot',
      Input: 'input',
      Ping: 'ping',
      EndMatch: 'end_match',
      DevForceStart: 'dev_force_start',
      DevSetNet: 'dev_set_net',
    });
    expect(ServerMessageType).toEqual({
      LobbyError: 'lobby_error',
      Snapshot: 'snapshot',
      Pong: 'pong',
      MatchCountdown: 'match_countdown',
    });
  });

  it('tem as fases lobby e partida', () => {
    expect(MATCH_PHASES).toEqual(['lobby', 'match']);
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
