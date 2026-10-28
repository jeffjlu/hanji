import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import { type Config } from './config.js';
import { createDb } from '@hanji/db';
import { apiRoutes } from './routes/index.js';
import { errorHandler } from './error-handler.js';

export async function buildApp(config: Config) {
  const app = Fastify({
    logger:
      config.NODE_ENV === 'development'
        ? {
            transport: {
              target: 'pino-pretty',
              options: {
                colorize: true,
                translateTime: 'SYS:standard',
              },
            },
          }
        : true,
  });

  await app.register(helmet);

  // TODO: add not-found handlers

  app.setErrorHandler(errorHandler);

  const { sql, close } = createDb(config.DATABASE_URL);
  await app.register(apiRoutes(sql), { prefix: '/api/v1' });

  app.addHook('onClose', async () => {
    await close();
  });

  return app;
}
