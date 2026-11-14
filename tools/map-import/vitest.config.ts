import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [
      // Os testes usam o código-fonte dos pacotes do repositório, sem precisar de build.
      {
        find: /^@rainbow-pixel\/maps\/format$/,
        replacement: fileURLToPath(new URL('../../packages/maps/src/format.ts', import.meta.url)),
      },
      {
        find: /^@rainbow-pixel\/shared$/,
        replacement: fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)),
      },
    ],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
