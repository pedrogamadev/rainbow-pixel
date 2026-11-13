import { describe, expect, it } from 'vitest';
import { BOT_DIFFICULTIES } from '../catalog/index.js';
import { isValidNickname, nicknameKey } from '../validation/index.js';
import {
  BOT_DIFFICULTY_PARAMS,
  DEV_SEED_USERS,
  LOBBY_CONFIG,
  MATCH_CONFIG,
  NICKNAME_CONFIG,
} from './index.js';

describe('MATCH_CONFIG', () => {
  it('descreve partidas 2v2', () => {
    expect(MATCH_CONFIG.teamCount).toBe(2);
    expect(MATCH_CONFIG.teamSize).toBe(2);
    expect(MATCH_CONFIG.maxPlayers).toBe(MATCH_CONFIG.teamCount * MATCH_CONFIG.teamSize);
  });
});

describe('LOBBY_CONFIG', () => {
  it('sempre deixa vaga para pelo menos um humano', () => {
    expect(LOBBY_CONFIG.maxBots).toBe(MATCH_CONFIG.maxPlayers - 1);
  });

  it('reserva a vaga de quem caiu por 60 segundos', () => {
    expect(LOBBY_CONFIG.reconnectionWindowSeconds).toBe(60);
  });
});

describe('NICKNAME_CONFIG', () => {
  it('limita o nickname entre 3 e 16 caracteres', () => {
    expect(NICKNAME_CONFIG).toEqual({ minLength: 3, maxLength: 16 });
  });
});

describe('DEV_SEED_USERS', () => {
  it('tem uma conta de teste para cada vaga da partida', () => {
    expect(DEV_SEED_USERS).toHaveLength(MATCH_CONFIG.maxPlayers);
    expect(DEV_SEED_USERS.map((user) => user.nickname)).toEqual(['dev1', 'dev2', 'dev3', 'dev4']);
  });

  it('usa e-mails do domínio local, um por nickname', () => {
    for (const user of DEV_SEED_USERS) {
      expect(user.email).toBe(`${user.nickname}@rainbowpixel.local`);
    }
  });

  it('só usa nicknames válidos e distintos', () => {
    for (const user of DEV_SEED_USERS) {
      expect(isValidNickname(user.nickname)).toBe(true);
    }
    const keys = new Set(DEV_SEED_USERS.map((user) => nicknameKey(user.nickname)));
    expect(keys.size).toBe(DEV_SEED_USERS.length);
  });
});

describe('BOT_DIFFICULTY_PARAMS', () => {
  it('tem parâmetros para cada dificuldade do catálogo', () => {
    expect(Object.keys(BOT_DIFFICULTY_PARAMS).sort()).toEqual(
      BOT_DIFFICULTIES.map((difficulty) => difficulty.id).sort(),
    );
  });

  it('fica mais difícil de easy para hard', () => {
    const { easy, medium, hard } = BOT_DIFFICULTY_PARAMS;
    expect(easy.reactionMs).toBeGreaterThan(medium.reactionMs);
    expect(medium.reactionMs).toBeGreaterThan(hard.reactionMs);
    expect(easy.aimErrorDeg).toBeGreaterThan(medium.aimErrorDeg);
    expect(medium.aimErrorDeg).toBeGreaterThan(hard.aimErrorDeg);
    expect(easy.turnSpeedDegPerSec).toBeLessThan(medium.turnSpeedDegPerSec);
    expect(medium.turnSpeedDegPerSec).toBeLessThan(hard.turnSpeedDegPerSec);
    expect(easy.memoryMs).toBeLessThan(medium.memoryMs);
    expect(medium.memoryMs).toBeLessThan(hard.memoryMs);
  });
});
