import { ROOM_CODE_CONFIG, isValidRoomCode } from '@rainbow-pixel/shared';
import { describe, expect, it } from 'vitest';
import { RoomCodeUnavailableError, generateRoomCode, generateUniqueRoomCode } from './roomCode.js';

const AMBIGUOUS_CHARACTERS = ['I', 'L', 'O', '0', '1'];

/** Devolve os índices dados, em ordem, repetindo o último. */
function sequence(indexes: readonly number[]): () => number {
  let position = 0;
  return () => {
    const value = indexes[Math.min(position, indexes.length - 1)] ?? 0;
    position += 1;
    return value;
  };
}

describe('generateRoomCode', () => {
  it('gera código com 6 caracteres', () => {
    for (let index = 0; index < 200; index += 1) {
      expect(generateRoomCode()).toHaveLength(6);
    }
  });

  it('usa somente o alfabeto permitido', () => {
    for (let index = 0; index < 500; index += 1) {
      const code = generateRoomCode();
      for (const character of code) {
        expect(ROOM_CODE_CONFIG.alphabet).toContain(character);
      }
      expect(isValidRoomCode(code)).toBe(true);
    }
  });

  it('nunca usa caracteres ambíguos', () => {
    for (let index = 0; index < 500; index += 1) {
      const code = generateRoomCode();
      for (const ambiguous of AMBIGUOUS_CHARACTERS) {
        expect(code).not.toContain(ambiguous);
      }
    }
  });

  it('alcança o alfabeto inteiro, do primeiro ao último caractere', () => {
    const { alphabet } = ROOM_CODE_CONFIG;
    expect(generateRoomCode(() => 0)).toBe(alphabet.charAt(0).repeat(6));
    expect(generateRoomCode(() => alphabet.length - 1)).toBe(
      alphabet.charAt(alphabet.length - 1).repeat(6),
    );
  });

  it('pede índices dentro do tamanho do alfabeto', () => {
    const requested: number[] = [];
    generateRoomCode((exclusiveMax) => {
      requested.push(exclusiveMax);
      return 0;
    });
    expect(requested).toEqual(Array(6).fill(ROOM_CODE_CONFIG.alphabet.length));
  });

  it('não repete o mesmo código o tempo todo', () => {
    const codes = new Set(Array.from({ length: 200 }, () => generateRoomCode()));
    expect(codes.size).toBeGreaterThan(190);
  });
});

describe('generateUniqueRoomCode', () => {
  it('devolve o primeiro código livre', async () => {
    const code = await generateUniqueRoomCode(() => false, { randomIndex: () => 0 });
    expect(code).toBe('AAAAAA');
  });

  it('tenta de novo quando o código já está em uso', async () => {
    const checked: string[] = [];
    // 6 sorteios por código: o primeiro código sai AAAAAA, o segundo BBBBBB.
    const randomIndex = sequence([0, 0, 0, 0, 0, 0, 1]);
    const code = await generateUniqueRoomCode(
      async (candidate) => {
        checked.push(candidate);
        return candidate === 'AAAAAA';
      },
      { randomIndex },
    );
    expect(checked).toEqual(['AAAAAA', 'BBBBBB']);
    expect(code).toBe('BBBBBB');
  });

  it('desiste depois do limite de tentativas', async () => {
    let attempts = 0;
    await expect(
      generateUniqueRoomCode(
        () => {
          attempts += 1;
          return true;
        },
        { maxAttempts: 5 },
      ),
    ).rejects.toBeInstanceOf(RoomCodeUnavailableError);
    expect(attempts).toBe(5);
  });
});
