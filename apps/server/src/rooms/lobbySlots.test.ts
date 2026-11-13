import { LOBBY_CONFIG, MATCH_CONFIG, TEAM_INDEXES } from '@rainbow-pixel/shared';
import type { BotDifficultyId, TeamIndex } from '@rainbow-pixel/shared';
import { describe, expect, it } from 'vitest';
import {
  addBot,
  addHuman,
  countBots,
  countHumans,
  countTeam,
  createLobby,
  findPlayer,
  isReadyToStart,
  removeBot,
  removePlayer,
  setConnected,
  toggleReady,
} from './lobbySlots.js';
import type { LobbyState } from './lobbySlots.js';

// Atalhos que falham o teste se a operação for recusada.

function join(lobby: LobbyState, name: string): LobbyState {
  const result = addHuman(lobby, {
    sessionId: `session-${name}`,
    profileId: `profile-${name}`,
    nickname: name,
  });
  if (!result.ok) {
    throw new Error(`addHuman recusou ${name}: ${result.error}`);
  }
  return result.lobby;
}

function bot(
  lobby: LobbyState,
  team: TeamIndex,
  difficulty: BotDifficultyId = 'medium',
  actor = lobby.hostSessionId,
): LobbyState {
  const result = addBot(lobby, actor, { team, difficulty });
  if (!result.ok) {
    throw new Error(`addBot recusou: ${result.error}`);
  }
  return result.lobby;
}

function ready(lobby: LobbyState, name: string): LobbyState {
  const result = toggleReady(lobby, `session-${name}`);
  if (!result.ok) {
    throw new Error(`toggleReady recusou ${name}: ${result.error}`);
  }
  return result.lobby;
}

function teamOf(lobby: LobbyState, playerId: string): TeamIndex | undefined {
  return findPlayer(lobby, playerId)?.team;
}

function expectTeamsWithinLimit(lobby: LobbyState): void {
  for (const team of TEAM_INDEXES) {
    expect(countTeam(lobby, team)).toBeLessThanOrEqual(MATCH_CONFIG.teamSize);
  }
  expect(lobby.players.length).toBeLessThanOrEqual(MATCH_CONFIG.maxPlayers);
}

/** 1 humano (host) no time 0 e 3 bots: bot:1 no time 1, bot:2 no time 0, bot:3 no time 1. */
function fullWithBots(): LobbyState {
  let lobby = join(createLobby(), 'ana');
  lobby = bot(lobby, 1, 'easy');
  lobby = bot(lobby, 0, 'medium');
  lobby = bot(lobby, 1, 'hard');
  return lobby;
}

describe('addHuman', () => {
  it('o primeiro humano vira host e entra no time 0', () => {
    const lobby = join(createLobby(), 'ana');
    expect(lobby.hostSessionId).toBe('session-ana');
    expect(lobby.players).toEqual([
      {
        playerId: 'session-ana',
        kind: 'human',
        profileId: 'profile-ana',
        nickname: 'ana',
        team: 0,
        ready: false,
        connected: true,
        botDifficulty: '',
      },
    ]);
  });

  it('distribui os humanos nos times e fecha em 2v2', () => {
    let lobby = createLobby();
    for (const name of ['ana', 'bia', 'caio', 'davi']) {
      lobby = join(lobby, name);
      expectTeamsWithinLimit(lobby);
    }
    expect(teamOf(lobby, 'session-ana')).toBe(0);
    expect(teamOf(lobby, 'session-bia')).toBe(1);
    expect(teamOf(lobby, 'session-caio')).toBe(0);
    expect(teamOf(lobby, 'session-davi')).toBe(1);
    expect(countTeam(lobby, 0)).toBe(2);
    expect(countTeam(lobby, 1)).toBe(2);
    expect(lobby.hostSessionId).toBe('session-ana');
  });

  it('recusa o quinto humano', () => {
    let lobby = createLobby();
    for (const name of ['ana', 'bia', 'caio', 'davi']) {
      lobby = join(lobby, name);
    }
    const result = addHuman(lobby, {
      sessionId: 'session-eva',
      profileId: 'profile-eva',
      nickname: 'eva',
    });
    expect(result).toEqual({ ok: false, error: 'room_full' });
  });

  it('recusa o mesmo usuário em duas vagas', () => {
    const lobby = join(createLobby(), 'ana');
    const result = addHuman(lobby, {
      sessionId: 'session-outra-aba',
      profileId: 'profile-ana',
      nickname: 'ana',
    });
    expect(result).toEqual({ ok: false, error: 'already_in_room' });
  });

  it('recusa o mesmo usuário mesmo com a vaga antiga desconectada', () => {
    const lobby = setConnected(join(createLobby(), 'ana'), 'session-ana', false);
    const result = addHuman(lobby, {
      sessionId: 'session-outra-aba',
      profileId: 'profile-ana',
      nickname: 'ana',
    });
    expect(result).toEqual({ ok: false, error: 'already_in_room' });
  });

  it('coloca o humano no time com vaga quando há bots', () => {
    let lobby = join(createLobby(), 'ana');
    lobby = bot(lobby, 0);
    lobby = join(lobby, 'bia');
    expect(teamOf(lobby, 'session-bia')).toBe(1);
    lobby = join(lobby, 'caio');
    expect(teamOf(lobby, 'session-caio')).toBe(1);
    expectTeamsWithinLimit(lobby);
  });

  it('não altera o lobby recebido', () => {
    const before = join(createLobby(), 'ana');
    const snapshot = structuredClone(before);
    join(before, 'bia');
    expect(before).toEqual(snapshot);
  });
});

describe('humano entrando em sala cheia com bots', () => {
  it('substitui o último bot adicionado', () => {
    const lobby = fullWithBots();
    const result = addHuman(lobby, {
      sessionId: 'session-bia',
      profileId: 'profile-bia',
      nickname: 'bia',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.replacedBotId).toBe('bot:3');
    expect(findPlayer(result.lobby, 'bot:3')).toBeUndefined();
    expect(findPlayer(result.lobby, 'bot:1')).toBeDefined();
    expect(findPlayer(result.lobby, 'bot:2')).toBeDefined();
    expect(result.lobby.players).toHaveLength(4);
    expect(countBots(result.lobby)).toBe(2);
    expect(countHumans(result.lobby)).toBe(2);
  });

  it('o humano herda a vaga e o time do bot que saiu', () => {
    const lobby = fullWithBots();
    const result = addHuman(lobby, {
      sessionId: 'session-bia',
      profileId: 'profile-bia',
      nickname: 'bia',
    });
    if (!result.ok) throw new Error(result.error);
    expect(teamOf(result.lobby, 'session-bia')).toBe(teamOf(lobby, 'bot:3'));
    expectTeamsWithinLimit(result.lobby);
  });

  it('"último" é o último adicionado, não o de maior número', () => {
    // Remove o bot:1 e adiciona outro: o novo reaproveita o número 1, mas é o mais recente.
    let lobby = fullWithBots();
    const removed = removeBot(lobby, 'session-ana', 'bot:1');
    if (!removed.ok) throw new Error(removed.error);
    lobby = bot(removed.lobby, 1, 'hard');
    expect(lobby.players.at(-1)?.playerId).toBe('bot:1');

    const result = addHuman(lobby, {
      sessionId: 'session-bia',
      profileId: 'profile-bia',
      nickname: 'bia',
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.replacedBotId).toBe('bot:1');
  });

  it('cada humano que entra tira mais um bot, até a sala ficar só com humanos', () => {
    let lobby = fullWithBots();
    for (const [name, expectedBots] of [
      ['bia', 2],
      ['caio', 1],
      ['davi', 0],
    ] as const) {
      lobby = join(lobby, name);
      expect(countBots(lobby)).toBe(expectedBots);
      expect(lobby.players).toHaveLength(4);
      expectTeamsWithinLimit(lobby);
    }
    const result = addHuman(lobby, {
      sessionId: 'session-eva',
      profileId: 'profile-eva',
      nickname: 'eva',
    });
    expect(result).toEqual({ ok: false, error: 'room_full' });
  });

  it('não substitui bot quando ainda há vaga livre', () => {
    let lobby = join(createLobby(), 'ana');
    lobby = bot(lobby, 1);
    const result = addHuman(lobby, {
      sessionId: 'session-bia',
      profileId: 'profile-bia',
      nickname: 'bia',
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.replacedBotId).toBeNull();
    expect(countBots(result.lobby)).toBe(1);
  });
});

describe('addBot', () => {
  it('cria o bot pronto, conectado, sem perfil e com nome pela dificuldade', () => {
    const lobby = bot(join(createLobby(), 'ana'), 1, 'medium');
    expect(findPlayer(lobby, 'bot:1')).toEqual({
      playerId: 'bot:1',
      kind: 'bot',
      profileId: '',
      nickname: 'BOT Médio 1',
      team: 1,
      ready: true,
      connected: true,
      botDifficulty: 'medium',
    });
  });

  it('numera os bots e usa o nome de cada dificuldade', () => {
    const lobby = fullWithBots();
    expect(findPlayer(lobby, 'bot:1')?.nickname).toBe('BOT Fácil 1');
    expect(findPlayer(lobby, 'bot:2')?.nickname).toBe('BOT Médio 2');
    expect(findPlayer(lobby, 'bot:3')?.nickname).toBe('BOT Difícil 3');
  });

  it('só o host adiciona bot', () => {
    const lobby = join(join(createLobby(), 'ana'), 'bia');
    expect(addBot(lobby, 'session-bia', { team: 0, difficulty: 'easy' })).toEqual({
      ok: false,
      error: 'not_host',
    });
    expect(addBot(lobby, 'session-desconhecida', { team: 0, difficulty: 'easy' })).toEqual({
      ok: false,
      error: 'not_host',
    });
    expect(addBot(createLobby(), '', { team: 0, difficulty: 'easy' })).toEqual({
      ok: false,
      error: 'not_host',
    });
    expect(countBots(lobby)).toBe(0);
  });

  it('nunca passa de 3 bots', () => {
    const lobby = fullWithBots();
    expect(countBots(lobby)).toBe(LOBBY_CONFIG.maxBots);
    expect(addBot(lobby, 'session-ana', { team: 0, difficulty: 'easy' })).toEqual({
      ok: false,
      error: 'max_bots',
    });

    // Mesmo com vaga livre, o limite de bots continua valendo.
    const removed = removePlayer(join(fullWithBots(), 'bia'), 'session-ana');
    expect(countBots(removed.lobby)).toBe(2);
    const refilled = bot(removed.lobby, 0, 'easy', 'session-bia');
    expect(countBots(refilled)).toBe(3);
    expect(addBot(refilled, 'session-bia', { team: 0, difficulty: 'easy' }).ok).toBe(false);
  });

  it('recusa bot com a sala cheia', () => {
    let lobby = createLobby();
    for (const name of ['ana', 'bia', 'caio', 'davi']) {
      lobby = join(lobby, name);
    }
    expect(addBot(lobby, 'session-ana', { team: 0, difficulty: 'easy' })).toEqual({
      ok: false,
      error: 'room_full',
    });
  });

  it('nunca passa de 2 jogadores por time', () => {
    let lobby = join(createLobby(), 'ana');
    lobby = bot(lobby, 0);
    expect(addBot(lobby, 'session-ana', { team: 0, difficulty: 'easy' })).toEqual({
      ok: false,
      error: 'team_full',
    });
    lobby = bot(lobby, 1);
    lobby = bot(lobby, 1);
    expect(addBot(lobby, 'session-ana', { team: 1, difficulty: 'easy' }).ok).toBe(false);
    expect(countTeam(lobby, 0)).toBe(2);
    expect(countTeam(lobby, 1)).toBe(2);
  });

  it('reaproveita o menor número livre', () => {
    const lobby = fullWithBots();
    const removed = removeBot(lobby, 'session-ana', 'bot:2');
    if (!removed.ok) throw new Error(removed.error);
    const result = addBot(removed.lobby, 'session-ana', { team: 0, difficulty: 'hard' });
    if (!result.ok) throw new Error(result.error);
    expect(result.botId).toBe('bot:2');
    expect(findPlayer(result.lobby, 'bot:2')?.nickname).toBe('BOT Difícil 2');
  });
});

describe('removeBot', () => {
  it('libera a vaga do bot', () => {
    const lobby = fullWithBots();
    const result = removeBot(lobby, 'session-ana', 'bot:2');
    if (!result.ok) throw new Error(result.error);
    expect(findPlayer(result.lobby, 'bot:2')).toBeUndefined();
    expect(result.lobby.players).toHaveLength(3);
    expect(countTeam(result.lobby, 0)).toBe(1);
    // A vaga pode ser ocupada de novo.
    expect(addBot(result.lobby, 'session-ana', { team: 0, difficulty: 'easy' }).ok).toBe(true);
  });

  it('só o host remove bot', () => {
    const lobby = join(bot(join(createLobby(), 'ana'), 1), 'bia');
    expect(removeBot(lobby, 'session-bia', 'bot:1')).toEqual({ ok: false, error: 'not_host' });
    expect(findPlayer(lobby, 'bot:1')).toBeDefined();
  });

  it('não remove humano nem bot inexistente', () => {
    const lobby = join(bot(join(createLobby(), 'ana'), 1), 'bia');
    expect(removeBot(lobby, 'session-ana', 'session-bia')).toEqual({
      ok: false,
      error: 'bot_not_found',
    });
    expect(removeBot(lobby, 'session-ana', 'bot:9')).toEqual({
      ok: false,
      error: 'bot_not_found',
    });
  });
});

describe('removePlayer', () => {
  it('tira o jogador e mantém o host', () => {
    const lobby = join(join(createLobby(), 'ana'), 'bia');
    const result = removePlayer(lobby, 'session-bia');
    expect(result.removed).toBe(true);
    expect(result.shouldDispose).toBe(false);
    expect(result.lobby.players.map((player) => player.playerId)).toEqual(['session-ana']);
    expect(result.lobby.hostSessionId).toBe('session-ana');
  });

  it('se o host sair, o próximo humano vira host', () => {
    let lobby = join(createLobby(), 'ana');
    lobby = bot(lobby, 1);
    lobby = join(lobby, 'bia');
    lobby = join(lobby, 'caio');
    const result = removePlayer(lobby, 'session-ana');
    expect(result.shouldDispose).toBe(false);
    expect(result.lobby.hostSessionId).toBe('session-bia');
    // O bot continua na sala e nunca vira host.
    expect(findPlayer(result.lobby, 'bot:1')).toBeDefined();
  });

  it('prefere um humano conectado para ser o novo host', () => {
    let lobby = join(join(join(createLobby(), 'ana'), 'bia'), 'caio');
    lobby = setConnected(lobby, 'session-bia', false);
    expect(removePlayer(lobby, 'session-ana').lobby.hostSessionId).toBe('session-caio');
  });

  it('usa um humano desconectado como host se for o único', () => {
    let lobby = join(join(createLobby(), 'ana'), 'bia');
    lobby = setConnected(lobby, 'session-bia', false);
    expect(removePlayer(lobby, 'session-ana').lobby.hostSessionId).toBe('session-bia');
  });

  it('sala sem humano é descartada, junto com os bots', () => {
    const lobby = fullWithBots();
    const result = removePlayer(lobby, 'session-ana');
    expect(result.removed).toBe(true);
    expect(result.shouldDispose).toBe(true);
    expect(result.lobby.players).toEqual([]);
    expect(result.lobby.hostSessionId).toBe('');
  });

  it('sala só de humanos é descartada quando o último sai', () => {
    const lobby = join(createLobby(), 'ana');
    expect(removePlayer(lobby, 'session-ana').shouldDispose).toBe(true);
  });

  it('ignora jogador desconhecido', () => {
    const lobby = join(createLobby(), 'ana');
    const result = removePlayer(lobby, 'session-fantasma');
    expect(result.removed).toBe(false);
    expect(result.shouldDispose).toBe(false);
    expect(result.lobby).toEqual(lobby);
  });
});

describe('setConnected', () => {
  it('marca desconectado e mantém vaga, time e pronto', () => {
    let lobby = ready(join(join(createLobby(), 'ana'), 'bia'), 'bia');
    lobby = setConnected(lobby, 'session-bia', false);
    expect(findPlayer(lobby, 'session-bia')).toMatchObject({
      connected: false,
      ready: true,
      team: 1,
    });
    lobby = setConnected(lobby, 'session-bia', true);
    expect(findPlayer(lobby, 'session-bia')?.connected).toBe(true);
  });

  it('vaga de desconectado continua contando no time', () => {
    let lobby = createLobby();
    for (const name of ['ana', 'bia', 'caio', 'davi']) {
      lobby = join(lobby, name);
    }
    lobby = setConnected(lobby, 'session-davi', false);
    const result = addHuman(lobby, {
      sessionId: 'session-eva',
      profileId: 'profile-eva',
      nickname: 'eva',
    });
    expect(result).toEqual({ ok: false, error: 'room_full' });
  });

  it('ignora jogador desconhecido e bot', () => {
    const lobby = bot(join(createLobby(), 'ana'), 1);
    expect(setConnected(lobby, 'session-fantasma', false)).toBe(lobby);
    expect(setConnected(lobby, 'bot:1', false)).toBe(lobby);
  });
});

describe('toggleReady', () => {
  it('alterna o pronto do humano', () => {
    let lobby = join(createLobby(), 'ana');
    lobby = ready(lobby, 'ana');
    expect(findPlayer(lobby, 'session-ana')?.ready).toBe(true);
    lobby = ready(lobby, 'ana');
    expect(findPlayer(lobby, 'session-ana')?.ready).toBe(false);
  });

  it('recusa jogador desconhecido e bot', () => {
    const lobby = bot(join(createLobby(), 'ana'), 1);
    expect(toggleReady(lobby, 'session-fantasma')).toEqual({
      ok: false,
      error: 'player_not_found',
    });
    expect(toggleReady(lobby, 'bot:1')).toEqual({ ok: false, error: 'player_not_found' });
    expect(findPlayer(lobby, 'bot:1')?.ready).toBe(true);
  });
});

describe('isReadyToStart', () => {
  it('exige 4 jogadores prontos', () => {
    let lobby = fullWithBots();
    expect(isReadyToStart(lobby)).toBe(false);
    lobby = ready(lobby, 'ana');
    expect(isReadyToStart(lobby)).toBe(true);
  });

  it('não vale com vaga livre', () => {
    let lobby = ready(join(createLobby(), 'ana'), 'ana');
    lobby = bot(lobby, 1);
    lobby = bot(lobby, 1);
    expect(isReadyToStart(lobby)).toBe(false);
  });

  it('não vale com humano desconectado', () => {
    let lobby = ready(fullWithBots(), 'ana');
    lobby = setConnected(lobby, 'session-ana', false);
    expect(isReadyToStart(lobby)).toBe(false);
  });

  it('vale com 4 humanos prontos', () => {
    let lobby = createLobby();
    for (const name of ['ana', 'bia', 'caio', 'davi']) {
      lobby = ready(join(lobby, name), name);
    }
    expect(isReadyToStart(lobby)).toBe(true);
  });
});
