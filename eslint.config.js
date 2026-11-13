import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/dist-worker-dev/**', '**/coverage/**', 'apps/api/src/generated/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      // Dinero: prohibido parseFloat/Number sobre importes en el dominio (usar money.ts).
      'no-restricted-globals': [
        'error',
        { name: 'parseFloat', message: 'Use parseAmount() de @finagent/domain para importes.' },
      ],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
);
