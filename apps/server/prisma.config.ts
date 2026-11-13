import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// O Prisma não carrega o .env sozinho. Os comandos rodam a partir de apps/server.
if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Migrations usam a conexão direta; o pooler fica só para o servidor (DATABASE_URL).
    // Sem valor, `prisma generate` continua funcionando (CI e postinstall).
    url: process.env.DIRECT_URL ?? '',
  },
});
