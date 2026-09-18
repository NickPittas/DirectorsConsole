/**
 * Correctness checks only. TypeScript owns type checking and unused identifiers;
 * this config intentionally avoids stylistic rules and duplicate no-unused rules.
 */
module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
    node: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: ['react-hooks'],
  rules: {
    // tsc already reports these, including TypeScript-only declarations.
    'no-unused-vars': 'off',
    'no-undef': 'off',
    // ComfyUI workflows are intentionally dynamic; this is not an any-removal migration.
    // Type-aware rules are omitted to keep tsc as the single source for type diagnostics.

    'array-callback-return': 'error',
    'no-async-promise-executor': 'error',
    'no-constant-binary-expression': 'error',
    'no-duplicate-case': 'error',
    'no-fallthrough': 'error',
    'no-invalid-regexp': 'error',
    'no-irregular-whitespace': 'error',
    'no-new-wrappers': 'error',
    'no-promise-executor-return': 'error',
    'no-self-assign': 'error',
    'no-self-compare': 'error',
    'no-unsafe-finally': 'error',
    'no-unsafe-negation': 'error',
    'no-unreachable': 'error',
    'use-isnan': 'error',
    'valid-typeof': 'error',

    'react-hooks/rules-of-hooks': 'error',
    // Keep dependency omissions visible; fix the existing hook-dependency debt incrementally.
    'react-hooks/exhaustive-deps': 'error',
  },
};
