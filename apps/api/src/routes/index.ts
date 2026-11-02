import { healthRoutes } from './health.js';
import { type Deps } from '../deps.js';
import { type FastifyPluginAsync, type FastifyInstance } from 'fastify';

export function apiRoutes(deps: Deps): FastifyPluginAsync {
  return async (app: FastifyInstance) => {
    await app.register(healthRoutes(deps.sql));
    // TODO: add rest of routes
  };
}
