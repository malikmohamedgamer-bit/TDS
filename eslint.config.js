import globals from 'globals';

export default [
  { ignores: ['_site/**', 'dist/**', 'vendor/**', 'node_modules/**', 'test-results/**', 'playwright-report/**', 'assets/**'] },
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.browser },
    },
    rules: {
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', ignoreRestSiblings: true }],
      'no-undef': 'error',
      'no-unreachable': 'error',
      'no-dupe-keys': 'error',
      'no-self-assign': 'error',
      'no-constant-condition': ['error', { checkLoops: false }],
      eqeqeq: ['error', 'smart'],
      'prefer-const': ['error', { ignoreReadBeforeAssign: true }],
      'no-var': 'error',
    },
  },
  {
    files: ['tools/**', 'test/**', 'src/core/**', 'playwright.config.js', 'eslint.config.js'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
];
