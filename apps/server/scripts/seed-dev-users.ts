// pnpm dev:seed-users
// Cria ou mantém as contas dev1 a dev4 (confirmadas) e seus perfis, para testar 2v2 sozinho.
// Só roda com DEV_TOOLS=true e nunca com NODE_ENV=production.
// Usa a chave secreta do Supabase, que existe só em apps/server/.env.

import { createClient } from '@supabase/supabase-js';
import { createPrismaClient } from '../src/db/client.js';
import { createPrismaProfileStore } from '../src/db/profiles.js';
import { assertDevToolsEnabled } from '../src/dev/guard.js';
import { seedDevUsers } from '../src/dev/seedDevUsers.js';
import type { DevAuthAdmin } from '../src/dev/seedDevUsers.js';
import { loadEnvFile } from '../src/env.js';

const USERS_PER_PAGE = 200;
const MAX_PAGES = 50;

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value === '') {
    throw new Error(`Defina ${name} em apps/server/.env.`);
  }
  return value;
}

function createSupabaseAuthAdmin(supabaseUrl: string, secretKey: string): DevAuthAdmin {
  const supabase = createClient(supabaseUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { admin } = supabase.auth;

  return {
    async createUser(email, password) {
      const { data, error } = await admin.createUser({ email, password, email_confirm: true });
      if (error !== null) {
        if (error.code === 'email_exists' || error.code === 'user_already_exists') {
          return null;
        }
        throw new Error(`Supabase recusou criar ${email}: ${error.message}`);
      }
      return data.user.id;
    },

    async findUserIdByEmail(email) {
      const wanted = email.toLowerCase();
      for (let page = 1; page <= MAX_PAGES; page += 1) {
        const { data, error } = await admin.listUsers({ page, perPage: USERS_PER_PAGE });
        if (error !== null) {
          throw new Error(`Supabase recusou listar usuários: ${error.message}`);
        }
        const found = data.users.find((user) => user.email?.toLowerCase() === wanted);
        if (found !== undefined) {
          return found.id;
        }
        if (data.users.length < USERS_PER_PAGE) {
          break;
        }
      }
      return null;
    },

    async syncUser(userId, password) {
      const { error } = await admin.updateUserById(userId, { password, email_confirm: true });
      if (error !== null) {
        throw new Error(`Supabase recusou atualizar ${userId}: ${error.message}`);
      }
    },
  };
}

async function main(): Promise<void> {
  loadEnvFile();
  assertDevToolsEnabled(process.env);

  const databaseUrl = requireEnv('DATABASE_URL');
  const supabaseUrl = requireEnv('SUPABASE_URL').replace(/\/+$/, '');
  const secretKey = requireEnv('SUPABASE_SECRET_KEY');
  const password = requireEnv('DEV_SEED_PASSWORD');

  const prisma = createPrismaClient(databaseUrl);
  try {
    const seeded = await seedDevUsers({
      auth: createSupabaseAuthAdmin(supabaseUrl, secretKey),
      profiles: createPrismaProfileStore(prisma),
      password,
    });
    for (const user of seeded) {
      const account = user.account === 'created' ? 'conta criada' : 'conta mantida';
      const profile = user.profile === 'created' ? 'perfil criado' : 'perfil mantido';
      console.info(`${user.email} (${user.nickname}): ${account}, ${profile}`);
    }
    console.info('Pronto. A senha das contas é o valor de DEV_SEED_PASSWORD.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
