import { type FastifyReply, type FastifyRequest } from 'fastify';
import { isOriginAllowed } from './origin.js';

export function originHook(allowedOrigin: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (
      !isOriginAllowed(
        request.method,
        request.headers.origin,
        request.headers.referer,
        allowedOrigin
      )
    ) {
      request.log.info(
        {
          method: request.method,
          path: request.url.split('?')[0],
          origin: request.headers.origin ?? null,
        },
        'Rejected request with invalid origin'
      );
      return reply.code(403).send({ error: 'Forbidden' });
    }
  };
}
