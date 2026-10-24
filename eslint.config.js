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
  }
);
