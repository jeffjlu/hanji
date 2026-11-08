import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import cookie from '@fastify/cookie';
import { type Deps } from './deps.js';
import { apiRoutes } from './routes/index.js';
import { errorHandler, notFoundHandler } from './errors.js';
import { originHook } from './auth/origin-hook.js';

export async function buildApp(deps: Deps) {
  const app = Fastify({
    logger:
      deps.config.NODE_ENV === 'development'
        ? {
            level: 'debug',
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

  await app.register(cookie, {
    hook: 'onRequest',
  });

  app.addHook('onRequest', originHook(deps.config.WEB_ORIGIN));

  await app.register(apiRoutes(deps), { prefix: '/api/v1' });

  app.addHook('onClose', async () => {
    await deps.close();
  });

  return app;
}
