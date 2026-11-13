import { nicknameKey } from '@rainbow-pixel/shared';
import { describe, expect, it } from 'vitest';
import type { ProfileRecord, ProfileStore } from '../db/profiles.js';
import { seedDevUsers } from './seedDevUsers.js';
import type { DevAuthAdmin } from './seedDevUsers.js';

interface FakeAccount {
  readonly id: string;
  password: string;
  confirmed: boolean;
}

function createFakeAuth(): DevAuthAdmin & { readonly accounts: Map<string, FakeAccount> } {
  const accounts = new Map<string, FakeAccount>();
  return {
    accounts,
    async createUser(email, password) {
      if (accounts.has(email)) {
        return null;
      }
      const id = `00000000-0000-4000-8000-${String(accounts.size + 1).padStart(12, '0')}`;
      accounts.set(email, { id, password, confirmed: true });
      return id;
    },
    async findUserIdByEmail(email) {
      return accounts.get(email)?.id ?? null;
    },
    async syncUser(userId, password) {
      for (const account of accounts.values()) {
        if (account.id === userId) {
          account.password = password;
          account.confirmed = true;
        }
      }
    },
  };
}

function createFakeProfiles(): ProfileStore & { readonly byId: Map<string, ProfileRecord> } {
  const byId = new Map<string, ProfileRecord>();
  return {
    byId,
    async findById(id) {
      return byId.get(id) ?? null;
    },
    async create(id, nickname) {
      if (byId.has(id)) {
        return { ok: false, error: 'profile_exists' };
      }
      for (const profile of byId.values()) {
        if (nicknameKey(profile.nickname) === nicknameKey(nickname)) {
          return { ok: false, error: 'nickname_taken' };
        }
      }
      const profile: ProfileRecord = { id, nickname, level: 1, xp: 0, createdAt: new Date() };
      byId.set(id, profile);
      return { ok: true, profile };
    },
  };
}

describe('seedDevUsers', () => {
  it('cria as 4 contas dev1 a dev4, com perfil', async () => {
    const auth = createFakeAuth();
    const profiles = createFakeProfiles();

    const seeded = await seedDevUsers({ auth, profiles, password: 'senha-de-teste' });

    expect(seeded.map((user) => user.email)).toEqual([
      'dev1@rainbowpixel.local',
      'dev2@rainbowpixel.local',
      'dev3@rainbowpixel.local',
      'dev4@rainbowpixel.local',
    ]);
    expect(seeded.every((user) => user.account === 'created' && user.profile === 'created')).toBe(
      true,
    );
    expect([...profiles.byId.values()].map((profile) => profile.nickname)).toEqual([
      'dev1',
      'dev2',
      'dev3',
      'dev4',
    ]);
    // O perfil usa o mesmo id da conta.
    for (const user of seeded) {
      expect(auth.accounts.get(user.email)?.id).toBe(user.userId);
      expect(profiles.byId.get(user.userId)?.nickname).toBe(user.nickname);
    }
  });

  it('rodar de novo mantém as contas e os perfis', async () => {
    const auth = createFakeAuth();
    const profiles = createFakeProfiles();
    const first = await seedDevUsers({ auth, profiles, password: 'senha-de-teste' });

    const second = await seedDevUsers({ auth, profiles, password: 'senha-de-teste' });

    expect(second.every((user) => user.account === 'kept' && user.profile === 'kept')).toBe(true);
    expect(second.map((user) => user.userId)).toEqual(first.map((user) => user.userId));
    expect(auth.accounts.size).toBe(4);
    expect(profiles.byId.size).toBe(4);
  });

  it('atualiza a senha das contas que já existiam', async () => {
    const auth = createFakeAuth();
    const profiles = createFakeProfiles();
    await seedDevUsers({ auth, profiles, password: 'senha-antiga' });

    await seedDevUsers({ auth, profiles, password: 'senha-nova' });

    for (const account of auth.accounts.values()) {
      expect(account.password).toBe('senha-nova');
    }
  });

  it('completa o que faltou de uma execução interrompida', async () => {
    const auth = createFakeAuth();
    const profiles = createFakeProfiles();
    // dev1 já tem conta, mas ficou sem perfil.
    await auth.createUser('dev1@rainbowpixel.local', 'senha-de-teste');

    const seeded = await seedDevUsers({ auth, profiles, password: 'senha-de-teste' });

    expect(seeded[0]).toMatchObject({ nickname: 'dev1', account: 'kept', profile: 'created' });
    expect(seeded.slice(1).every((user) => user.account === 'created')).toBe(true);
    expect(profiles.byId.size).toBe(4);
  });

  it('avisa quando o nickname de teste já é de outro usuário', async () => {
    const auth = createFakeAuth();
    const profiles = createFakeProfiles();
    await profiles.create('99999999-9999-4999-8999-999999999999', 'DEV2');

    await expect(seedDevUsers({ auth, profiles, password: 'senha-de-teste' })).rejects.toThrow(
      /dev2/,
    );
  });
});
