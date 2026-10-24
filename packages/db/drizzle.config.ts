import { defineConfig } from 'drizzle-kit';
import { loadDbConfig } from './src/config.js';
import { loadDotEnv } from './src/load-env.js';

// Same config module the API uses, so a bad DATABASE_URL fails here with the
// same message naming the variable.
loadDotEnv();
const { DATABASE_URL } = loadDbConfig();

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './drizzle', // generated SQL migrations; committed to git
  dbCredentials: { url: DATABASE_URL },
  strict: true,
});
