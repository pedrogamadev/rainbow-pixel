import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

function source(path: string): string {
  return fileURLToPath(new URL(path, import.meta.url));
}

export default defineConfig({
  resolve: {
    alias: [
      // Os testes usam o código-fonte dos pacotes do repositório, sem precisar de build.
      {
        find: /^@rainbow-pixel\/shared$/,
        replacement: source('../../packages/shared/src/index.ts'),
      },
      { find: /^@rainbow-pixel\/maps$/, replacement: source('../../packages/maps/src/index.ts') },
      { find: /^@rainbow-pixel\/bots$/, replacement: source('../../packages/bots/src/index.ts') },
    ],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
