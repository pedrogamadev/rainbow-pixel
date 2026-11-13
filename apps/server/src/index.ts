import { QUICK_MATCH_ROOM_NAME } from '@rainbow-pixel/shared';
import { WebSocketTransport, defineRoom, defineServer, matchMaker } from 'colyseus';
import { createSupabaseJwtVerifier } from './auth/verifyJwt.js';
import { createPrismaClient } from './db/client.js';
import { createPrismaProfileStore } from './db/profiles.js';
import { DevToolsGuardError, assertDevToolsAllowed } from './dev/guard.js';
import { EnvError, loadEnvFile, parseEnv } from './env.js';
import type { Env } from './env.js';
import { buildCorsHeaders } from './http/cors.js';
import { createApiRouter } from './http/routes.js';
import { QuickMatchRoom, configureQuickMatchRoom } from './rooms/QuickMatchRoom.js';

function readEnv(): Env {
  loadEnvFile();
  try {
    // Primeira checagem da subida: ferramentas de teste nunca rodam em produção.
    assertDevToolsAllowed(process.env);
    return parseEnv(process.env);
  } catch (error) {
    if (error instanceof DevToolsGuardError || error instanceof EnvError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
}

/**
 * O Colyseus responde o CORS de todas as requisições (matchmaking e API) e, por padrão,
 * libera qualquer origem. Aqui só passam as origens de CORS_ORIGINS.
 */
function restrictCors(allowedOrigins: readonly string[]): void {
  const { controller } = matchMaker;
  delete (controller.DEFAULT_CORS_HEADERS as Record<string, string>)['Access-Control-Allow-Origin'];
  controller.getCorsHeaders = (headers) => buildCorsHeaders(headers.get('origin'), allowedOrigins);
}

const env = readEnv();

const prisma = createPrismaClient(env.DATABASE_URL);
const profiles = createPrismaProfileStore(prisma);
const verifyJwt = createSupabaseJwtVerifier({
  mode: env.AUTH_JWT_MODE,
  supabaseUrl: env.SUPABASE_URL,
  jwtSecret: env.SUPABASE_JWT_SECRET,
});

configureQuickMatchRoom({ verifyJwt, profiles });
restrictCors(env.CORS_ORIGINS);
// Erros de matchmaking saem com status HTTP comum (401, 404...) em vez de 520 a 526,
// faixa que o Cloudflare reserva e troca por uma página própria no túnel.
matchMaker.controller.standardHttpStatus = true;

// Express e Colyseus no mesmo processo e na mesma porta.
const server = defineServer({
  rooms: {
    [QUICK_MATCH_ROOM_NAME]: defineRoom(QuickMatchRoom),
  },
  // Transporte explícito: o client gerado do Prisma define `globalThis.__dirname`, e com isso
  // o carregamento automático do transporte padrão do Colyseus tenta um `require` que não
  // existe em ESM.
  transport: new WebSocketTransport(),
  express: (app) => {
    app.disable('x-powered-by');
    app.use(createApiRouter({ verifyJwt, profiles }));
  },
  greet: false,
});

server.onShutdown(() => prisma.$disconnect());

await server.listen(env.PORT);
console.info(
  `[server] ouvindo na porta ${env.PORT} ` +
    `(NODE_ENV=${env.NODE_ENV}, AUTH_JWT_MODE=${env.AUTH_JWT_MODE}, DEV_TOOLS=${env.DEV_TOOLS})`,
);
