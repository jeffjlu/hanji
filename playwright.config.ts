import { defineConfig, devices } from '@playwright/test';

const WEB = 'http://localhost:5173';
const API = 'http://localhost:3000';

const E2E_DATABASE_URL =
  process.env['E2E_DATABASE_URL'] ?? 'postgres://hanji:hanji_local_dev@localhost:5432/hanji_e2e';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: process.env['CI'] ? 1 : undefined,
  reporter: process.env['CI']
    ? [['line'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: WEB,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm --filter @hanji/api start:e2e',
      url: `${API}/api/v1/health`,
      reuseExistingServer: false,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        NODE_ENV: 'test',
        DATABASE_URL: E2E_DATABASE_URL,
        SESSION_SECRET: 'e2e-secret-at-least-32-characters-long',
        WEB_ORIGIN: WEB,
        REGISTRATION_CODE: 'e2e-invite-code',
        RATE_LIMIT_MAX: '1000',
      },
    },
    {
      command: 'pnpm --filter @hanji/web dev',
      url: WEB,
      reuseExistingServer: false,
    },
  ],
});
