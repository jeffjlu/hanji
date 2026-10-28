import { healthRoutes } from './health.js';
import { type Sql } from '@hanji/db';
import { type FastifyPluginAsync, type FastifyInstance } from 'fastify';

export function apiRoutes(sql: Sql): FastifyPluginAsync {
  return async (app: FastifyInstance) => {
    await app.register(healthRoutes(sql));
    // TODO: add rest of routes
  };
}
