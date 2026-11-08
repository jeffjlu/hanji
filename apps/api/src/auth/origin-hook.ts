import { type FastifyRequest } from 'fastify';
import { isOriginAllowed } from './origin.js';
import { HttpError } from '../errors.js';

export function originHook(allowedOrigin: string) {
  return async (request: FastifyRequest): Promise<void> => {
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
      throw new HttpError(403, 'Forbidden');
    }
  };
}
