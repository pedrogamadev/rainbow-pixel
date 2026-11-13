import { existsSync } from 'node:fs';
import { z } from 'zod';

/** Variável vazia no .env conta como ausente. */
function emptyToUndefined(value: unknown): unknown {
  return typeof value === 'string' && value.trim() === '' ? undefined : value;
}

function optionalString() {
  return z.preprocess(emptyToUndefined, z.string().trim().optional());
}

function requiredString(name: string) {
  return z.preprocess(emptyToUndefined, z.string({ error: `${name} é obrigatória.` }).trim());
}

function requiredUrl(name: string) {
  return z.preprocess(
    emptyToUndefined,
    z
      .string({ error: `${name} é obrigatória.` })
      .trim()
      .pipe(z.url({ error: `${name} precisa ser uma URL válida.` })),
  );
}

const envSchema = z
  .object({
    NODE_ENV: z.preprocess(
      emptyToUndefined,
      z.enum(['development', 'test', 'production']).default('development'),
    ),
    PORT: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(65535).default(2567)),
    /** Origens liberadas no CORS, separadas por vírgula. */
    CORS_ORIGINS: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .default('')
        .transform((value) =>
          value
            .split(',')
            .map((origin) => origin.trim().replace(/\/+$/, ''))
            .filter((origin) => origin !== ''),
        ),
    ),
    /** URL do pooler, usada pelo servidor em tempo de execução. */
    DATABASE_URL: requiredString('DATABASE_URL'),
    SUPABASE_URL: requiredUrl('SUPABASE_URL').transform((value) => value.replace(/\/+$/, '')),
    AUTH_JWT_MODE: z.preprocess(emptyToUndefined, z.enum(['jwks', 'secret']).default('jwks')),
    SUPABASE_JWT_SECRET: optionalString(),
    DEV_TOOLS: z.preprocess(
      emptyToUndefined,
      z
        .enum(['true', 'false'])
        .default('false')
        .transform((value) => value === 'true'),
    ),
  })
  .superRefine((env, ctx) => {
    if (env.AUTH_JWT_MODE === 'secret' && env.SUPABASE_JWT_SECRET === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['SUPABASE_JWT_SECRET'],
        message: 'SUPABASE_JWT_SECRET é obrigatória quando AUTH_JWT_MODE=secret.',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export class EnvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnvError';
  }
}

/** Carrega o .env do diretório atual (apps/server), sem sobrescrever o que já está definido. */
export function loadEnvFile(path = '.env'): void {
  if (existsSync(path)) {
    process.loadEnvFile(path);
  }
}

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const lines = result.error.issues.map((issue) => {
      const name = issue.path.join('.');
      return name === '' ? `- ${issue.message}` : `- ${name}: ${issue.message}`;
    });
    throw new EnvError(
      `Variáveis de ambiente inválidas (veja apps/server/.env.example):\n${lines.join('\n')}`,
    );
  }
  return result.data;
}
