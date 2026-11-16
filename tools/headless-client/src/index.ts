// pnpm headless --user dev2 [--code ABC123 | --create] --script circle --duration 60 ...
// Cliente sem tela (ferramenta de teste, escopo, seção 17). Faz login com uma conta de teste,
// entra na sala, roda um roteiro de input e imprime um resumo em JSON.
// Só roda com DEV_TOOLS=true no próprio .env e nunca com NODE_ENV=production.

import { existsSync } from 'node:fs';
import { DEV_SEED_USERS } from '@rainbow-pixel/shared';
import { createClient } from '@supabase/supabase-js';
import { DevToolsGuardError, assertDevToolsEnabled } from '../../../apps/server/src/dev/guard.js';
import { ArgsError, USAGE, parseHeadlessArgs } from './args.js';
import { createScript } from './scripts/index.js';
import { runSession } from './session.js';

const ENV_FILE = 'tools/headless-client/.env';

/** Códigos de saída: 0 ok, 1 limite violado, 2 erro ou partida interrompida. */
const EXIT_LIMIT_VIOLATED = 1;
const EXIT_ERROR = 2;

function log(message: string): void {
  console.error(`[headless] ${message}`);
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value === '') {
    throw new Error(`Defina ${name} em ${ENV_FILE}.`);
  }
  return value;
}

async function signIn(user: string): Promise<string> {
  const account = DEV_SEED_USERS.find((seed) => seed.nickname === user);
  if (account === undefined) {
    throw new Error(`Conta de teste desconhecida: ${user}`);
  }
  const supabase = createClient(
    requireEnv('SUPABASE_URL'),
    requireEnv('SUPABASE_PUBLISHABLE_KEY'),
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  const { data, error } = await supabase.auth.signInWithPassword({
    email: account.email,
    password: requireEnv('DEV_SEED_PASSWORD'),
  });
  if (error !== null || data.session === null) {
    throw new Error(
      `Login de ${account.email} recusado: ${error?.message ?? 'sem sessão'}. Rode pnpm dev:seed-users?`,
    );
  }
  return data.session.access_token;
}

async function main(): Promise<number> {
  if (existsSync('.env')) {
    process.loadEnvFile('.env');
  }
  assertDevToolsEnabled(process.env, ENV_FILE);
  const options = parseHeadlessArgs(process.argv.slice(2));
  const serverUrl = process.env['SERVER_WS_URL']?.trim() || 'ws://localhost:2567';

  log(`login como ${options.user}`);
  const accessToken = await signIn(options.user);
  const result = await runSession({
    serverUrl,
    accessToken,
    room: options.room,
    script: createScript(options.script, options.seed),
    durationSeconds: options.durationSeconds,
    net: options.net,
    limits: options.limits,
    log,
  });

  const report = {
    user: options.user,
    code: result.code,
    playerId: result.playerId,
    script: options.script,
    net: options.net,
    endedEarly: result.endedEarly,
    ...result.summary,
  };
  console.info(JSON.stringify(report, null, 2));

  if (result.endedEarly) {
    log('a partida acabou ou a conexão caiu antes do fim do roteiro');
    return EXIT_ERROR;
  }
  if (result.summary.violations.length > 0) {
    for (const violation of result.summary.violations) log(`limite violado: ${violation}`);
    return EXIT_LIMIT_VIOLATED;
  }
  return 0;
}

/** Sai com o código, mesmo que alguma biblioteca deixe um timer ou socket aberto. */
function finish(code: number): void {
  process.exitCode = code;
  setTimeout(() => process.exit(code), 500).unref();
}

main().then(finish, (error: unknown) => {
  if (error instanceof ArgsError) {
    console.error(`${error.message}\n\n${USAGE}`);
  } else if (error instanceof DevToolsGuardError) {
    console.error(error.message);
  } else {
    console.error(`[headless] ${error instanceof Error ? error.message : String(error)}`);
  }
  finish(EXIT_ERROR);
});
