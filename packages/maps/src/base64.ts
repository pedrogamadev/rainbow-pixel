// Base64 sem depender de atob/btoa nem de Buffer: o mesmo código roda no navegador e no Node.

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const LOOKUP = new Int16Array(128).fill(-1);
for (let index = 0; index < ALPHABET.length; index += 1) {
  LOOKUP[ALPHABET.charCodeAt(index)] = index;
}

export function encodeBase64(bytes: Uint8Array): string {
  let output = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const b0 = bytes[index] ?? 0;
    const b1 = bytes[index + 1] ?? 0;
    const b2 = bytes[index + 2] ?? 0;
    const triple = (b0 << 16) | (b1 << 8) | b2;
    output += ALPHABET.charAt((triple >> 18) & 63);
    output += ALPHABET.charAt((triple >> 12) & 63);
    output += index + 1 < bytes.length ? ALPHABET.charAt((triple >> 6) & 63) : '=';
    output += index + 2 < bytes.length ? ALPHABET.charAt(triple & 63) : '=';
  }
  return output;
}

export class InvalidBase64Error extends Error {
  constructor() {
    super('Texto base64 inválido.');
    this.name = 'InvalidBase64Error';
  }
}

export function decodeBase64(text: string): Uint8Array {
  if (text.length % 4 !== 0) {
    throw new InvalidBase64Error();
  }
  const padding = text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0;
  const bytes = new Uint8Array((text.length / 4) * 3 - padding);
  let out = 0;
  for (let index = 0; index < text.length; index += 4) {
    let triple = 0;
    for (let offset = 0; offset < 4; offset += 1) {
      const char = text.charCodeAt(index + offset);
      const isPadding = char === 61 && index + offset >= text.length - padding;
      const value = isPadding ? 0 : char < 128 ? (LOOKUP[char] ?? -1) : -1;
      if (value < 0) {
        throw new InvalidBase64Error();
      }
      triple = (triple << 6) | value;
    }
    if (out < bytes.length) bytes[out++] = (triple >> 16) & 255;
    if (out < bytes.length) bytes[out++] = (triple >> 8) & 255;
    if (out < bytes.length) bytes[out++] = triple & 255;
  }
  return bytes;
}
