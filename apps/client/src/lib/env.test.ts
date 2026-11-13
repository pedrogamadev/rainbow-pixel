import { describe, expect, it } from 'vitest';
import { parseClientEnv } from './env';
import type { RawClientEnv } from './env';

const COMPLETE: RawClientEnv = {
  VITE_SUPABASE_URL: 'https://projeto.supabase.co',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_exemplo',
  VITE_SERVER_HTTP_URL: 'http://localhost:2567',
  VITE_SERVER_WS_URL: 'ws://localhost:2567',
  VITE_DEV_TOOLS: 'false',
  VITE_DEV_SEED_PASSWORD: undefined,
};

describe('parseClientEnv', () => {
  it('aceita a configuração completa', () => {
    const { env, problems } = parseClientEnv(COMPLETE);

    expect(problems).toEqual([]);
    expect(env).toEqual({
      supabaseUrl: 'https://projeto.supabase.co',
      supabasePublishableKey: 'sb_publishable_exemplo',
      serverHttpUrl: 'http://localhost:2567',
      serverWsUrl: 'ws://localhost:2567',
      devTools: false,
      devSeedPassword: '',
    });
  });

  it('tira a barra do fim dos endereços', () => {
    const { env, problems } = parseClientEnv({
      ...COMPLETE,
      VITE_SERVER_HTTP_URL: 'https://jogo.trycloudflare.com/',
      VITE_SERVER_WS_URL: 'wss://jogo.trycloudflare.com/',
    });

    expect(problems).toEqual([]);
    expect(env.serverHttpUrl).toBe('https://jogo.trycloudflare.com');
    expect(env.serverWsUrl).toBe('wss://jogo.trycloudflare.com');
  });

  it('aponta cada variável obrigatória que falta', () => {
    const { problems } = parseClientEnv({
      VITE_SUPABASE_URL: undefined,
      VITE_SUPABASE_PUBLISHABLE_KEY: '  ',
      VITE_SERVER_HTTP_URL: '',
      VITE_SERVER_WS_URL: undefined,
      VITE_DEV_TOOLS: undefined,
      VITE_DEV_SEED_PASSWORD: undefined,
    });

    expect(problems).toEqual([
      'VITE_SUPABASE_URL não foi definida.',
      'VITE_SUPABASE_PUBLISHABLE_KEY não foi definida.',
      'VITE_SERVER_HTTP_URL não foi definida.',
      'VITE_SERVER_WS_URL não foi definida.',
    ]);
  });

  it('recusa endereço com o protocolo errado', () => {
    const { problems } = parseClientEnv({
      ...COMPLETE,
      VITE_SERVER_HTTP_URL: 'ws://localhost:2567',
      VITE_SERVER_WS_URL: 'http://localhost:2567',
    });

    expect(problems).toEqual([
      'VITE_SERVER_HTTP_URL precisa começar com http:// ou https://.',
      'VITE_SERVER_WS_URL precisa começar com ws:// ou wss://.',
    ]);
  });

  it('recusa endereço que não é uma URL', () => {
    const { problems } = parseClientEnv({ ...COMPLETE, VITE_SUPABASE_URL: 'projeto supabase' });

    expect(problems).toEqual(['VITE_SUPABASE_URL não é um endereço válido.']);
  });

  it('liga as ferramentas de teste somente com o valor exato "true"', () => {
    expect(parseClientEnv({ ...COMPLETE, VITE_DEV_TOOLS: 'true' }).env.devTools).toBe(true);
    expect(parseClientEnv({ ...COMPLETE, VITE_DEV_TOOLS: 'TRUE' }).env.devTools).toBe(false);
    expect(parseClientEnv({ ...COMPLETE, VITE_DEV_TOOLS: '1' }).env.devTools).toBe(false);
    expect(parseClientEnv({ ...COMPLETE, VITE_DEV_TOOLS: undefined }).env.devTools).toBe(false);
  });

  it('repassa a senha das contas de teste quando configurada', () => {
    const { env } = parseClientEnv({ ...COMPLETE, VITE_DEV_SEED_PASSWORD: 'senha-de-teste' });

    expect(env.devSeedPassword).toBe('senha-de-teste');
  });
});
