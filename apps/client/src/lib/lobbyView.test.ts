import type { LobbyPlayer, QuickMatchState } from '@rainbow-pixel/shared';
import { describe, expect, it } from 'vitest';
import { toLobbyView } from './lobbyView';

function human(nickname: string, team: 0 | 1, overrides: Partial<LobbyPlayer> = {}): LobbyPlayer {
  return {
    kind: 'human',
    profileId: `profile-${nickname}`,
    nickname,
    team,
    ready: false,
    connected: true,
    botDifficulty: '',
    ...overrides,
  };
}

function bot(nickname: string, team: 0 | 1): LobbyPlayer {
  return {
    kind: 'bot',
    profileId: '',
    nickname,
    team,
    ready: true,
    connected: true,
    botDifficulty: 'medium',
  };
}

function stateOf(hostSessionId: string, players: [string, LobbyPlayer][]): QuickMatchState {
  return { code: 'ABC234', hostSessionId, players: new Map(players) };
}

describe('toLobbyView', () => {
  it('separa os jogadores por time e completa com vagas livres', () => {
    const view = toLobbyView(
      stateOf('s1', [
        ['s1', human('ana', 0)],
        ['s2', human('bia', 1)],
      ]),
      's1',
    );

    expect(view.code).toBe('ABC234');
    expect(view.playerCount).toBe(2);
    expect(view.teams.map((team) => team.team)).toEqual([0, 1]);
    expect(view.teams.map((team) => team.slots.map((slot) => slot?.nickname ?? null))).toEqual([
      ['ana', null],
      ['bia', null],
    ]);
  });

  it('marca quem é o jogador desta aba e quem é o host', () => {
    const view = toLobbyView(
      stateOf('s1', [
        ['s1', human('ana', 0)],
        ['s2', human('bia', 1)],
      ]),
      's2',
    );

    expect(view.self?.nickname).toBe('bia');
    expect(view.self?.isSelf).toBe(true);
    expect(view.isHost).toBe(false);
    expect(view.teams[0]?.slots[0]).toMatchObject({ nickname: 'ana', isHost: true, isSelf: false });
  });

  it('avisa quando o jogador desta aba é o host', () => {
    const view = toLobbyView(stateOf('s1', [['s1', human('ana', 0)]]), 's1');

    expect(view.isHost).toBe(true);
  });

  it('mantém a ordem de entrada dentro do time e não deixa vaga livre em time cheio', () => {
    const view = toLobbyView(
      stateOf('s1', [
        ['s1', human('ana', 0)],
        ['bot:1', bot('BOT Médio 1', 1)],
        ['bot:2', bot('BOT Médio 2', 0)],
        ['bot:3', bot('BOT Médio 3', 1)],
      ]),
      's1',
    );

    expect(view.playerCount).toBe(4);
    expect(view.teams[0]?.slots.map((slot) => slot?.playerId)).toEqual(['s1', 'bot:2']);
    expect(view.teams[1]?.slots.map((slot) => slot?.playerId)).toEqual(['bot:1', 'bot:3']);
    expect(view.teams[1]?.slots[0]).toMatchObject({ kind: 'bot', botDifficulty: 'medium' });
  });

  it('repassa pronto e conexão de cada jogador', () => {
    const view = toLobbyView(
      stateOf('s1', [
        ['s1', human('ana', 0, { ready: true })],
        ['s2', human('bia', 1, { connected: false })],
      ]),
      's1',
    );

    expect(view.teams[0]?.slots[0]).toMatchObject({ ready: true, connected: true });
    expect(view.teams[1]?.slots[0]).toMatchObject({ ready: false, connected: false });
  });

  it('não tem jogador próprio enquanto o estado ainda não o inclui', () => {
    const view = toLobbyView(stateOf('', []), 's1');

    expect(view.self).toBeNull();
    expect(view.isHost).toBe(false);
    expect(view.playerCount).toBe(0);
    expect(view.teams.every((team) => team.slots.every((slot) => slot === null))).toBe(true);
  });
});
