import { ROOM_CODE_CONFIG } from '../config/index.js';

/** Aceita o código como o jogador digita: com espaços nas pontas e em minúsculas. */
export function normalizeRoomCode(input: string): string {
  return input.trim().toUpperCase();
}

export function isValidRoomCode(code: string): boolean {
  if (code.length !== ROOM_CODE_CONFIG.length) {
    return false;
  }
  for (const char of code) {
    if (!ROOM_CODE_CONFIG.alphabet.includes(char)) {
      return false;
    }
  }
  return true;
}
