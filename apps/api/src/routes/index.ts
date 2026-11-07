import { healthRoutes } from './health.js';
import { type Deps } from '../deps.js';
import { type FastifyPluginAsync, type FastifyInstance } from 'fastify';
import { requireAuth } from '../auth/require-auth.js';
import { authRoutes } from './auth.js';

export function apiRoutes(deps: Deps): FastifyPluginAsync {
  return async (app: FastifyInstance) => {
    // Public routes
    await app.register(healthRoutes(deps.sql));
    await app.register(authRoutes(deps));
    // TODO: add rest of routes

    // Protected routes
    await app.register(async (protectedScope) => {
      protectedScope.addHook('onRequest', requireAuth(deps));
      // TODO: add rest of routes
    });
  };
}
