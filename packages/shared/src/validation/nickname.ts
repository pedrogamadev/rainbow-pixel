import { NICKNAME_CONFIG } from '../config/index.js';

export const NICKNAME_PATTERN = /^[A-Za-z0-9_]+$/;

export type NicknameError = 'too_short' | 'too_long' | 'invalid_characters';

export type NicknameValidation =
  { readonly ok: true } | { readonly ok: false; readonly error: NicknameError };

export const NICKNAME_ERROR_MESSAGES: Readonly<Record<NicknameError, string>> = {
  too_short: `O nickname precisa ter pelo menos ${NICKNAME_CONFIG.minLength} caracteres.`,
  too_long: `O nickname pode ter no máximo ${NICKNAME_CONFIG.maxLength} caracteres.`,
  invalid_characters: 'Use apenas letras sem acento, números e _ (sem espaços).',
};

export function validateNickname(nickname: string): NicknameValidation {
  if (nickname.length < NICKNAME_CONFIG.minLength) {
    return { ok: false, error: 'too_short' };
  }
  if (nickname.length > NICKNAME_CONFIG.maxLength) {
    return { ok: false, error: 'too_long' };
  }
  if (!NICKNAME_PATTERN.test(nickname)) {
    return { ok: false, error: 'invalid_characters' };
  }
  return { ok: true };
}

export function isValidNickname(nickname: string): boolean {
  return validateNickname(nickname).ok;
}

/** Chave de unicidade: nicknames que só diferem em maiúsculas são o mesmo. */
export function nicknameKey(nickname: string): string {
  return nickname.toLowerCase();
}
