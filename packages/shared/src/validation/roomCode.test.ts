import { describe, expect, it } from 'vitest';
import { ROOM_CODE_CONFIG } from '../config/index.js';
import { isValidRoomCode, normalizeRoomCode } from './roomCode.js';

describe('isValidRoomCode', () => {
  it('aceita código de 6 caracteres do alfabeto permitido', () => {
    expect(isValidRoomCode('ABCDEF')).toBe(true);
    expect(isValidRoomCode('Z9Y8X7')).toBe(true);
    expect(isValidRoomCode('234567')).toBe(true);
  });

  it('recusa comprimento diferente de 6', () => {
    expect(isValidRoomCode('')).toBe(false);
    expect(isValidRoomCode('ABCDE')).toBe(false);
    expect(isValidRoomCode('ABCDEFG')).toBe(false);
  });

  it('recusa caracteres ambíguos', () => {
    for (const ambiguous of ['I', 'L', 'O', '0', '1']) {
      expect(isValidRoomCode(`ABCDE${ambiguous}`)).toBe(false);
    }
  });

  it('recusa caracteres fora do alfabeto', () => {
    expect(isValidRoomCode('abcdef')).toBe(false);
    expect(isValidRoomCode('ABC-EF')).toBe(false);
    expect(isValidRoomCode('ABC EF')).toBe(false);
  });
});

describe('normalizeRoomCode', () => {
  it('remove espaços das pontas e converte para maiúsculas', () => {
    expect(normalizeRoomCode('  abcdef \n')).toBe('ABCDEF');
    expect(isValidRoomCode(normalizeRoomCode(' k7m2qx '))).toBe(true);
  });
});

describe('ROOM_CODE_CONFIG', () => {
  it('usa código de 6 caracteres', () => {
    expect(ROOM_CODE_CONFIG.length).toBe(6);
  });

  it('não tem caracteres ambíguos nem repetidos no alfabeto', () => {
    const chars = [...ROOM_CODE_CONFIG.alphabet];
    expect(new Set(chars).size).toBe(chars.length);
    for (const ambiguous of ['I', 'L', 'O', '0', '1']) {
      expect(chars).not.toContain(ambiguous);
    }
    expect(ROOM_CODE_CONFIG.alphabet).toMatch(/^[A-Z2-9]+$/);
  });
});
