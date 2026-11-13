import { describe, expect, it } from 'vitest';
import {
  NICKNAME_ERROR_MESSAGES,
  isValidNickname,
  nicknameKey,
  validateNickname,
} from './nickname.js';

describe('validateNickname', () => {
  it('aceita nicknames válidos', () => {
    for (const nickname of ['abc', 'Pedro_01', 'A1_', '___', 'a'.repeat(16)]) {
      expect(validateNickname(nickname)).toEqual({ ok: true });
    }
  });

  it('recusa nickname curto', () => {
    expect(validateNickname('')).toEqual({ ok: false, error: 'too_short' });
    expect(validateNickname('ab')).toEqual({ ok: false, error: 'too_short' });
  });

  it('recusa nickname longo', () => {
    expect(validateNickname('a'.repeat(17))).toEqual({ ok: false, error: 'too_long' });
  });

  it('recusa caracteres inválidos', () => {
    for (const nickname of ['joão', 'ab-cd', 'ab.cd', 'ab@cd', 'emoji😀']) {
      expect(validateNickname(nickname)).toEqual({ ok: false, error: 'invalid_characters' });
    }
  });

  it('recusa espaços', () => {
    for (const nickname of ['ab cd', ' abc', 'abc ', 'ab\tcd']) {
      expect(validateNickname(nickname)).toEqual({ ok: false, error: 'invalid_characters' });
    }
  });

  it('tem mensagem para cada erro', () => {
    for (const message of Object.values(NICKNAME_ERROR_MESSAGES)) {
      expect(message.length).toBeGreaterThan(0);
    }
  });
});

describe('isValidNickname', () => {
  it('acompanha validateNickname', () => {
    expect(isValidNickname('Pedro_01')).toBe(true);
    expect(isValidNickname('ab')).toBe(false);
  });
});

describe('nicknameKey', () => {
  it('ignora maiúsculas e minúsculas', () => {
    expect(nicknameKey('PeDrO_01')).toBe('pedro_01');
    expect(nicknameKey('PEDRO')).toBe(nicknameKey('pedro'));
  });
});
