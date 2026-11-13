import { describe, expect, it } from 'vitest';
import { EnvError, parseEnv } from './env.js';

const base = {
  DATABASE_URL: 'postgresql://user:pass@localhost:6543/postgres',
  SUPABASE_URL: 'https://example.supabase.co',
};

describe('parseEnv', () => {
  it('aplica os padrões', () => {
    const env = parseEnv(base);
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(2567);
    expect(env.CORS_ORIGINS).toEqual([]);
    expect(env.AUTH_JWT_MODE).toBe('jwks');
    expect(env.DEV_TOOLS).toBe(false);
  });

  it('trata variável vazia como ausente', () => {
    const env = parseEnv({
      ...base,
      PORT: '',
      NODE_ENV: '',
      AUTH_JWT_MODE: '',
      DEV_TOOLS: '',
      SUPABASE_JWT_SECRET: '',
    });
    expect(env.PORT).toBe(2567);
    expect(env.NODE_ENV).toBe('development');
    expect(env.AUTH_JWT_MODE).toBe('jwks');
    expect(env.DEV_TOOLS).toBe(false);
    expect(env.SUPABASE_JWT_SECRET).toBeUndefined();
  });

  it('separa CORS_ORIGINS por vírgula e tira a barra final', () => {
    const env = parseEnv({
      ...base,
      CORS_ORIGINS: 'http://localhost:5173, https://jogo.example.com/ ,',
    });
    expect(env.CORS_ORIGINS).toEqual(['http://localhost:5173', 'https://jogo.example.com']);
  });

  it('converte PORT e DEV_TOOLS', () => {
    const env = parseEnv({ ...base, PORT: '3000', DEV_TOOLS: 'true' });
    expect(env.PORT).toBe(3000);
    expect(env.DEV_TOOLS).toBe(true);
  });

  it('tira a barra final de SUPABASE_URL', () => {
    const env = parseEnv({ ...base, SUPABASE_URL: 'https://example.supabase.co/' });
    expect(env.SUPABASE_URL).toBe('https://example.supabase.co');
  });

  it('exige DATABASE_URL e SUPABASE_URL', () => {
    expect(() => parseEnv({})).toThrow(EnvError);
    expect(() => parseEnv({ SUPABASE_URL: base.SUPABASE_URL })).toThrow(/DATABASE_URL/);
    expect(() => parseEnv({ DATABASE_URL: base.DATABASE_URL })).toThrow(/SUPABASE_URL/);
  });

  it('recusa SUPABASE_URL que não é URL', () => {
    expect(() => parseEnv({ ...base, SUPABASE_URL: 'não é url' })).toThrow(/SUPABASE_URL/);
  });

  it('exige SUPABASE_JWT_SECRET no modo secret', () => {
    expect(() => parseEnv({ ...base, AUTH_JWT_MODE: 'secret' })).toThrow(/SUPABASE_JWT_SECRET/);
    const env = parseEnv({ ...base, AUTH_JWT_MODE: 'secret', SUPABASE_JWT_SECRET: 'segredo' });
    expect(env.SUPABASE_JWT_SECRET).toBe('segredo');
  });

  it('recusa valores fora do esperado', () => {
    expect(() => parseEnv({ ...base, AUTH_JWT_MODE: 'outro' })).toThrow(/AUTH_JWT_MODE/);
    expect(() => parseEnv({ ...base, PORT: 'abc' })).toThrow(/PORT/);
    expect(() => parseEnv({ ...base, DEV_TOOLS: 'sim' })).toThrow(/DEV_TOOLS/);
  });
});
