import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import { type Config } from './config.js';
import { type Deps } from './deps.js';
import { apiRoutes } from './routes/index.js';
import { errorHandler, notFoundHandler } from './errors.js';

export async function buildApp(config: Config, deps: Deps) {
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

  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler(notFoundHandler);

  await app.register(apiRoutes(deps), { prefix: '/api/v1' });

  app.addHook('onClose', async () => {
    await deps.close();
  });

  return app;
}
