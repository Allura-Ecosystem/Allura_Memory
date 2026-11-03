import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['node_modules/**'] },
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts', 'tests/**/*.ts', 'scripts/**/*.ts', 'ui/**/*.tsx', 'eslint.config.mjs'],
    rules: {
      'eqeqeq': 'error',
      'curly': 'error',
      'no-constant-condition': 'error',
    },
  },
);
