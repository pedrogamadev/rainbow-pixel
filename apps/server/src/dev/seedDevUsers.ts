// Ferramenta de teste (seção 17 do escopo): contas dev1 a dev4 para testar 2v2 sozinho.
// Quem chama precisa ter passado por assertDevToolsEnabled (veja scripts/seed-dev-users.ts).

import { DEV_SEED_USERS } from '@rainbow-pixel/shared';
import type { ProfileStore } from '../db/profiles.js';

/** Operações administrativas de contas. No script, usa a API admin do Supabase. */
export interface DevAuthAdmin {
  /** Cria a conta já confirmada. Devolve o id, ou `null` se o e-mail já tem conta. */
  createUser(email: string, password: string): Promise<string | null>;
  findUserIdByEmail(email: string): Promise<string | null>;
  /** Deixa a conta existente com a senha atual e o e-mail confirmado. */
  syncUser(userId: string, password: string): Promise<void>;
}

export interface DevSeedUser {
  readonly nickname: string;
  readonly email: string;
}

export interface SeedDevUsersOptions {
  readonly auth: DevAuthAdmin;
  readonly profiles: ProfileStore;
  readonly password: string;
  readonly users?: readonly DevSeedUser[];
}

export interface SeededUser {
  readonly email: string;
  readonly nickname: string;
  readonly userId: string;
  readonly account: 'created' | 'kept';
  readonly profile: 'created' | 'kept';
}

/** Cria ou mantém as contas de teste e seus perfis. Pode rodar quantas vezes for preciso. */
export async function seedDevUsers(options: SeedDevUsersOptions): Promise<SeededUser[]> {
  const { auth, profiles, password } = options;
  const users = options.users ?? DEV_SEED_USERS;
  const seeded: SeededUser[] = [];

  for (const user of users) {
    let account: SeededUser['account'] = 'created';
    let userId = await auth.createUser(user.email, password);
    if (userId === null) {
      account = 'kept';
      userId = await auth.findUserIdByEmail(user.email);
      if (userId === null) {
        throw new Error(`A conta ${user.email} já existe, mas não foi encontrada na listagem.`);
      }
      await auth.syncUser(userId, password);
    }

    let profile: SeededUser['profile'] = 'kept';
    let nickname: string = user.nickname;
    const existing = await profiles.findById(userId);
    if (existing !== null) {
      nickname = existing.nickname;
    } else {
      const created = await profiles.create(userId, user.nickname);
      if (created.ok) {
        profile = 'created';
      } else if (created.error === 'nickname_taken') {
        throw new Error(
          `O nickname ${user.nickname} já pertence a outro usuário. ` +
            `Libere esse nickname para a conta ${user.email}.`,
        );
      }
      // profile_exists: outro processo criou o perfil no meio do caminho. Segue como mantido.
    }

    seeded.push({ email: user.email, nickname, userId, account, profile });
  }

  return seeded;
}
