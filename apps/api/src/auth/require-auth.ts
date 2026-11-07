import { type FastifyReply, type FastifyRequest } from 'fastify';
import { type Deps } from '../deps.js';
import { HttpError } from '../errors.js';
import {
  getSessionCookieOptions,
  getSessionExpiry,
  hashToken,
  SESSION_COOKIE_NAME,
  shouldExtendSession,
} from './session.js';
import { extendSession, findSessionByTokenHash } from '@hanji/db';
import { type SafeUser } from './safe-user.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: SafeUser;
  }
}

export function requireAuth(deps: Deps) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const now = deps.now();
    const token = request.cookies[SESSION_COOKIE_NAME];
    if (!token) throw new HttpError(401, 'Unauthorized');

    const tokenHash = hashToken(token);
    const session = await findSessionByTokenHash(deps.db, tokenHash);
    if (!session || session.expiresAt <= now) throw new HttpError(401, 'Unauthorized');
    if (shouldExtendSession(session.expiresAt, now)) {
      const extendedSession = await extendSession(deps.db, session.id, getSessionExpiry(now));
      if (!extendedSession) throw new Error('Failed to extend session: session no longer exists');
      reply.setCookie(SESSION_COOKIE_NAME, token, getSessionCookieOptions(deps.config.NODE_ENV));
    }
    request.user = session.user;
  };
}
