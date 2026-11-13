import { describe, expect, it } from 'vitest';
import { buildCorsHeaders } from './cors.js';

const allowed = ['http://localhost:5173', 'https://jogo.example.com'];

describe('buildCorsHeaders', () => {
  it('libera origem que está na lista', () => {
    expect(buildCorsHeaders('http://localhost:5173', allowed)).toEqual({
      Vary: 'Origin',
      'Access-Control-Allow-Origin': 'http://localhost:5173',
    });
    expect(buildCorsHeaders('https://jogo.example.com', allowed)).toMatchObject({
      'Access-Control-Allow-Origin': 'https://jogo.example.com',
    });
  });

  it('não libera origem fora da lista', () => {
    expect(buildCorsHeaders('https://malicioso.example.com', allowed)).toEqual({ Vary: 'Origin' });
    expect(buildCorsHeaders('http://localhost:5174', allowed)).toEqual({ Vary: 'Origin' });
  });

  it('não libera quando não há origem', () => {
    expect(buildCorsHeaders(null, allowed)).toEqual({ Vary: 'Origin' });
    expect(buildCorsHeaders(undefined, allowed)).toEqual({ Vary: 'Origin' });
    expect(buildCorsHeaders('', allowed)).toEqual({ Vary: 'Origin' });
  });

  it('não libera nada com a lista vazia', () => {
    expect(buildCorsHeaders('http://localhost:5173', [])).toEqual({ Vary: 'Origin' });
  });

  it('nunca devolve curinga', () => {
    expect(buildCorsHeaders('*', allowed)).toEqual({ Vary: 'Origin' });
  });
});
