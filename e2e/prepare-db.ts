import { execFileSync } from 'node:child_process';

const E2E_DATABASE_URL =
  process.env['E2E_DATABASE_URL'] ?? 'postgres://hanji:hanji_local_dev@localhost:5432/hanji_e2e';

const databaseUrl = new URL(E2E_DATABASE_URL);
if (databaseUrl.pathname !== '/hanji_e2e') {
  throw new Error('E2E_DATABASE_URL must point to hanji_e2e');
}

// CI provides Postgres as a service container; locally, start Compose.
if (!process.env['CI']) {
  execFileSync('docker', ['compose', 'up', '-d', '--wait'], { stdio: 'inherit' });
}

const adminUrl = new URL(databaseUrl);
adminUrl.pathname = '/postgres';

execFileSync(
  'psql',
  [
    adminUrl.toString(),
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    'DROP DATABASE IF EXISTS hanji_e2e WITH (FORCE)',
    '-c',
    'CREATE DATABASE hanji_e2e',
  ],
  { stdio: 'inherit' }
);

execFileSync('pnpm', ['db:migrate'], {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: E2E_DATABASE_URL },
});
