import { randomInt } from 'node:crypto';
import { ROOM_CODE_CONFIG } from '@rainbow-pixel/shared';

/** Sorteia um inteiro em [0, exclusiveMax). */
export type RandomIndex = (exclusiveMax: number) => number;

/** Tentativas antes de desistir de achar um código livre. */
const DEFAULT_MAX_ATTEMPTS = 20;

export class RoomCodeUnavailableError extends Error {
  constructor() {
    super('Não foi possível gerar um código de sala livre.');
    this.name = 'RoomCodeUnavailableError';
  }
}

export function generateRoomCode(
  randomIndex: RandomIndex = (exclusiveMax) => randomInt(exclusiveMax),
): string {
  const { alphabet, length } = ROOM_CODE_CONFIG;
  let code = '';
  for (let index = 0; index < length; index += 1) {
    code += alphabet.charAt(randomIndex(alphabet.length));
  }
  return code;
}

export interface UniqueRoomCodeOptions {
  readonly maxAttempts?: number;
  readonly randomIndex?: RandomIndex;
}

/** Gera códigos até achar um que `isTaken` não reconheça como em uso. */
export async function generateUniqueRoomCode(
  isTaken: (code: string) => boolean | Promise<boolean>,
  options: UniqueRoomCodeOptions = {},
): Promise<string> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const code = generateRoomCode(options.randomIndex);
    if (!(await isTaken(code))) {
      return code;
    }
  }
  throw new RoomCodeUnavailableError();
}
