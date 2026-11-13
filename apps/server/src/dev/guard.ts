// Ferramentas de teste (seção 17 do escopo) só existem com DEV_TOOLS=true
// e nunca podem rodar com NODE_ENV=production.

export interface DevToolsEnv {
  readonly DEV_TOOLS?: string | undefined;
  readonly NODE_ENV?: string | undefined;
}

export class DevToolsGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DevToolsGuardError';
  }
}

function normalize(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

export function isDevToolsEnabled(env: DevToolsEnv): boolean {
  return normalize(env.DEV_TOOLS) === 'true';
}

export function isProduction(env: DevToolsEnv): boolean {
  return normalize(env.NODE_ENV) === 'production';
}

/** Chamado na subida do servidor, antes de qualquer outra coisa. */
export function assertDevToolsAllowed(env: DevToolsEnv): void {
  if (isDevToolsEnabled(env) && isProduction(env)) {
    throw new DevToolsGuardError(
      'DEV_TOOLS=true não é permitido com NODE_ENV=production. ' +
        'Desligue DEV_TOOLS ou rode fora de produção.',
    );
  }
}

/** Chamado por toda ferramenta de teste antes de fazer qualquer coisa. */
export function assertDevToolsEnabled(env: DevToolsEnv): void {
  assertDevToolsAllowed(env);
  if (!isDevToolsEnabled(env)) {
    throw new DevToolsGuardError(
      'Esta ferramenta só roda com DEV_TOOLS=true. Defina DEV_TOOLS=true em apps/server/.env.',
    );
  }
}
