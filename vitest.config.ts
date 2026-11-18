import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['packages/core/src/**'],
      exclude: ['**/*.test.ts', '**/*.d.ts'],
      thresholds: {
        lines: 90,
      },
    },
    projects: [
      {
        test: {
          name: 'unit',
          include: ['**/*.test.ts'],
          exclude: ['**/node_modules/**', '**/*.int.test.ts'],
        },
      },
      {
        test: {
          name: 'integration',
          include: ['**/*.int.test.ts'],
          exclude: ['**/node_modules/**'],
          globalSetup: ['./packages/db/src/testing/global-setup.ts'],
          testTimeout: 30_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
