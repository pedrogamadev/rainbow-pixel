import { describe, expect, it } from 'vitest';
import { InvalidBase64Error, decodeBase64, encodeBase64 } from './base64.js';

const text = (value: string) => new TextEncoder().encode(value);

describe('base64', () => {
  it('codifica como o padrão (RFC 4648)', () => {
    expect(encodeBase64(text('Man'))).toBe('TWFu');
    expect(encodeBase64(text('Ma'))).toBe('TWE=');
    expect(encodeBase64(text('M'))).toBe('TQ==');
    expect(encodeBase64(new Uint8Array())).toBe('');
  });

  it('volta aos mesmos bytes, em qualquer tamanho', () => {
    for (let length = 0; length < 70; length += 1) {
      const bytes = Uint8Array.from({ length }, (_value, index) => (index * 37 + length) % 256);
      expect(decodeBase64(encodeBase64(bytes))).toEqual(bytes);
    }
  });

  it('recusa texto que não é base64', () => {
    expect(() => decodeBase64('abc')).toThrow(InvalidBase64Error);
    expect(() => decodeBase64('ab$=')).toThrow(InvalidBase64Error);
    expect(() => decodeBase64('a=bc')).toThrow(InvalidBase64Error);
  });
});
