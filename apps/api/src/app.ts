import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import { type Deps } from './deps.js';
import { apiRoutes } from './routes/index.js';
import { errorHandler, HttpError, notFoundHandler } from './errors.js';
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

  // Rate limiting keys requests by the direct connection address (req.ip).
  // trustProxy is deliberately not enabled, so X-Forwarded-For is ignored and
  // cannot be spoofed to dodge the limit. Enabling trustProxy / deriving the
  // key from X-Forwarded-For is an explicit opt-in for running behind a proxy
  // and is left as a Phase 2 task once the host setup is known.
  await app.register(rateLimit, {
    global: false,
    max: deps.config.RATE_LIMIT_MAX,
    timeWindow: deps.config.RATE_LIMIT_WINDOW_SECONDS * 1000,
    errorResponseBuilder: () => new HttpError(429, 'Rate limit exceeded. Please try again later.'),
  });

  await app.register(apiRoutes(deps), { prefix: '/api/v1' });

  app.addHook('onClose', async () => {
    await deps.close();
  });

  return app;
}
