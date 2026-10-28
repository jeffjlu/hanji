import { loadDotEnv, ConfigError } from '@hanji/db';
import { type Config, loadConfig } from './config.js';
import { buildApp } from './app.js';

loadDotEnv();

function loadConfigOrExit(): Config {
  try {
    return loadConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
}

const config = loadConfigOrExit();
const app = await buildApp(config);

try {
  await app.listen({
    port: config.PORT,
    host: config.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1',
  });
} catch (err) {
  app.log.error(err);
  await app.close();
  process.exit(1);
}

let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) return; // ignore repeated signals
  shuttingDown = true;
  app.log.info({ signal }, 'shutting down');

  // Backstop in case a connection never drains.
  setTimeout(() => {
    app.log.error('forced exit after timeout');
    process.exit(1);
  }, 10_000).unref();

  try {
    await app.close();
    process.exit(0);
  } catch (err) {
    app.log.error({ err }, 'error during shutdown');
    process.exit(1);
  }
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
