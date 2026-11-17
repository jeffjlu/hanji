import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/node_modules', '**/dist', '**/build', '**/*.config.*'] },
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
  {
    files: ['packages/core/src/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Do not use random, as replay must be deterministic.',
        },
        {
          object: 'Date',
          property: 'now',
          message: 'Do not use the current time, as replay must not depend on when code was run.',
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: 'new Date() with no argument reads the clock. Pass an instant from the event.',
        },
        {
          selector: "CallExpression[callee.name='Date']",
          message: 'Date() reads the clock. Pass an instant from the event.',
        },
      ],
    },
  }
);
