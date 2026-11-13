import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { nicknameKey } from '@rainbow-pixel/shared';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { InvalidTokenError } from '../auth/verifyJwt.js';
import type { VerifyJwt } from '../auth/verifyJwt.js';
import type { ProfileRecord, ProfileStore } from '../db/profiles.js';
import { createApiRouter } from './routes.js';

const USER_A = '3f2b8c1e-5a47-4d0b-9c36-1e7a2b9d4f10';
const USER_B = '9a1d7e42-0c5b-4f6e-8b21-6d3c4e5f7a80';

const TOKENS: Readonly<Record<string, string>> = {
  'token-a': USER_A,
  'token-b': USER_B,
};

const verifyJwt: VerifyJwt = async (token) => {
  const userId = TOKENS[token];
  if (userId === undefined) {
    throw new InvalidTokenError();
  }
  return { userId, email: null };
};

/** Guarda perfis em memória, com as mesmas regras de unicidade do banco. */
function createMemoryProfileStore(): ProfileStore & { readonly statsCreated: Set<string> } {
  const byId = new Map<string, ProfileRecord>();
  const statsCreated = new Set<string>();
  return {
    statsCreated,
    async findById(id) {
      return byId.get(id) ?? null;
    },
    async create(id, nickname) {
      if (byId.has(id)) {
        return { ok: false, error: 'profile_exists' };
      }
      const key = nicknameKey(nickname);
      for (const profile of byId.values()) {
        if (nicknameKey(profile.nickname) === key) {
          return { ok: false, error: 'nickname_taken' };
        }
      }
      const profile: ProfileRecord = {
        id,
        nickname,
        level: 1,
        xp: 0,
        createdAt: new Date('2026-01-02T03:04:05.000Z'),
      };
      byId.set(id, profile);
      statsCreated.add(id);
      return { ok: true, profile };
    },
  };
}

describe('API REST', () => {
  let server: Server;
  let baseUrl: string;
  let profiles: ReturnType<typeof createMemoryProfileStore>;

  beforeEach(async () => {
    profiles = createMemoryProfileStore();
    const app = express();
    app.use(createApiRouter({ verifyJwt, profiles }));
    server = await new Promise<Server>((resolve) => {
      const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
    });
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  function request(path: string, init: RequestInit = {}, token?: string): Promise<Response> {
    const headers = new Headers(init.headers);
    if (token !== undefined) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    return fetch(`${baseUrl}${path}`, { ...init, headers });
  }

  function createProfile(nickname: unknown, token = 'token-a'): Promise<Response> {
    return request(
      '/profiles',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname }),
      },
      token,
    );
  }

  describe('GET /health', () => {
    it('responde 200 sem autenticação', async () => {
      const response = await request('/health');
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: 'ok' });
    });
  });

  describe('autenticação', () => {
    it('recusa rota protegida sem token', async () => {
      const response = await request('/me');
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({ error: 'unauthorized' });
    });

    it('recusa token inválido', async () => {
      const response = await request('/me', {}, 'token-falso');
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({ error: 'unauthorized' });
    });

    it('recusa cabeçalho que não é Bearer', async () => {
      const response = await request('/me', { headers: { Authorization: 'Basic token-a' } });
      expect(response.status).toBe(401);
    });

    it('recusa POST /profiles sem token, antes de olhar o corpo', async () => {
      const response = await request('/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{ isso não é json',
      });
      expect(response.status).toBe(401);
    });

    it('exige token até em rota que não existe', async () => {
      expect((await request('/nao-existe')).status).toBe(401);
      const response = await request('/nao-existe', {}, 'token-a');
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ error: 'not_found' });
    });
  });

  describe('GET /me', () => {
    it('responde 404 quando o usuário ainda não tem perfil', async () => {
      const response = await request('/me', {}, 'token-a');
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ error: 'profile_not_found' });
    });

    it('devolve o perfil do dono do token', async () => {
      await createProfile('Pedro_01', 'token-a');
      await createProfile('Outro', 'token-b');

      const response = await request('/me', {}, 'token-a');
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        id: USER_A,
        nickname: 'Pedro_01',
        level: 1,
        xp: 0,
        createdAt: '2026-01-02T03:04:05.000Z',
      });
    });
  });

  describe('POST /profiles', () => {
    it('cria o perfil com estatísticas zeradas', async () => {
      const response = await createProfile('Pedro_01');
      expect(response.status).toBe(201);
      expect(await response.json()).toMatchObject({ id: USER_A, nickname: 'Pedro_01', level: 1 });
      expect(profiles.statsCreated.has(USER_A)).toBe(true);
    });

    it('usa o id do token e ignora id enviado no corpo', async () => {
      const response = await request(
        '/profiles',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nickname: 'Pedro_01', id: USER_B }),
        },
        'token-a',
      );
      expect(response.status).toBe(201);
      expect(await response.json()).toMatchObject({ id: USER_A });
      expect(await profiles.findById(USER_B)).toBeNull();
    });

    it.each([
      ['curto demais', 'ab'],
      ['longo demais', 'a'.repeat(17)],
      ['com espaço', 'pedro gama'],
      ['com acento', 'joão'],
      ['com símbolo', 'pedro!'],
    ])('recusa nickname %s com 400', async (_label, nickname) => {
      const response = await createProfile(nickname);
      expect(response.status).toBe(400);
      const body = (await response.json()) as { error: string; message: string };
      expect(body.error).toBe('invalid_nickname');
      expect(body.message).not.toBe('');
    });

    it('recusa corpo sem nickname ou com tipo errado', async () => {
      const missing = await request(
        '/profiles',
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
        'token-a',
      );
      expect(missing.status).toBe(400);
      expect(await missing.json()).toMatchObject({ error: 'invalid_body' });

      const wrongType = await createProfile(123);
      expect(wrongType.status).toBe(400);
      expect(await wrongType.json()).toMatchObject({ error: 'invalid_body' });
    });

    it('recusa JSON malformado com 400', async () => {
      const response = await request(
        '/profiles',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{ isso não é json',
        },
        'token-a',
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: 'invalid_body' });
    });

    it('recusa nickname já usado com 409', async () => {
      await createProfile('Pedro_01', 'token-a');
      const response = await createProfile('Pedro_01', 'token-b');
      expect(response.status).toBe(409);
      const body = (await response.json()) as { error: string; message: string };
      expect(body.error).toBe('nickname_taken');
      expect(body.message).toMatch(/já está em uso/);
    });

    it('recusa nickname que só muda maiúsculas e minúsculas', async () => {
      await createProfile('Pedro_01', 'token-a');
      const response = await createProfile('PEDRO_01', 'token-b');
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ error: 'nickname_taken' });
    });

    it('recusa segundo perfil do mesmo usuário com 409', async () => {
      await createProfile('Pedro_01', 'token-a');
      const response = await createProfile('OutroNome', 'token-a');
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ error: 'profile_exists' });
    });
  });
});
