import { type FastifyInstance, type FastifyPluginAsync } from 'fastify';

export function meRoute(): FastifyPluginAsync {
  return async (app: FastifyInstance) => {
    app.get('/me', async (request, reply) => {
      return reply.code(200).send({
        user: request.user,
      });
    });
  };
}
