import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', 'apps/server/src/generated/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    rules: {
      // AGENTS.md, seção 6: `any` só com comentário explicando o motivo (via eslint-disable).
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['packages/**/*.ts', 'apps/server/**/*.ts', '*.js'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['apps/client/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    files: ['apps/client/vite.config.ts'],
    languageOptions: { globals: globals.node },
  },
  prettier,
);
