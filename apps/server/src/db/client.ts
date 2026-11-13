import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

/**
 * Cliente do banco para o servidor em execução.
 * Recebe a URL do pooler (DATABASE_URL); migrations usam DIRECT_URL (prisma.config.ts).
 */
export function createPrismaClient(databaseUrl: string): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });
}

export type { PrismaClient };
