import { execFileSync } from 'node:child_process';

const E2E_DATABASE_URL =
  process.env['E2E_DATABASE_URL'] ?? 'postgres://hanji:hanji_local_dev@localhost:5432/hanji_e2e';

console.log('Starting database setup...');

export default async function globalSetup() {
  execFileSync('docker', ['compose', 'up', '-d']);
  const databaseUrl = new URL(E2E_DATABASE_URL);

  // Protect against accidentally dropping another database.
  if (databaseUrl.pathname !== '/hanji_e2e') {
    throw new Error('E2E_DATABASE_URL must point to hanji_e2e');
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

  console.log('E2E database created.');

  execFileSync('pnpm', ['db:migrate'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: E2E_DATABASE_URL,
    },
  });

  console.log('E2E database migrated.');
}
