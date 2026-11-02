import { buildApp } from '../src/app.js';

export function buildTestApp() {
  return buildApp({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgres://hanji:hanji_local_dev@localhost:5432/hanji',
    SESSION_SECRET: 'test-secret-that-is-at-least-32-characters-long',
    WEB_ORIGIN: 'http://localhost:5173',
    REGISTRATION_CODE: 'local-invite-code',
    PORT: 3000,
  });
}
