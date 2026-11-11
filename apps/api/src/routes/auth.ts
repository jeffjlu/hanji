import { type FastifyInstance, type FastifyPluginAsync } from 'fastify';
import { loginRequestSchema, registerRequestSchema } from '@hanji/schemas';
import { type Deps } from '../deps.js';
import { HttpError } from '../errors.js';
import { safeCompare } from '../safe-compare.js';
import { hashPassword, verifyPassword, verifyPasswordWithDummyHash } from '../auth/password.js';
import { createSession, createUser, deleteSession, findUserByEmail } from '@hanji/db';
import {
  generateToken,
  getSessionCookieOptions,
  getSessionExpiry,
  hashToken,
  SESSION_COOKIE_NAME,
} from '../auth/session.js';

export function authRoutes(deps: Deps): FastifyPluginAsync {
  return async (app: FastifyInstance) => {
    app.post(
      '/register',
      {
        config: {
          rateLimit: {},
        },
      },
      async (request, reply) => {
        const { email, password, inviteCode } = registerRequestSchema.parse(request.body);

        if (!safeCompare(inviteCode, deps.config.REGISTRATION_CODE))
          throw new HttpError(403, 'Forbidden', [
            {
              field: 'inviteCode',
              message: 'Invalid invite code.',
            },
          ]);

        const passwordHash = await hashPassword(password);
        const { user, token } = await deps.db.transaction(async (tx) => {
          const createUserResult = await createUser(tx, {
            email,
            passwordHash,
          });
          if (!createUserResult.success)
            throw new HttpError(409, 'Conflict', [
              {
                field: 'email',
                message: 'An account with this email already exists.',
              },
            ]);

          const newUser = createUserResult.user;
          const token = generateToken();
          await createSession(tx, {
            userId: newUser.id,
            tokenHash: hashToken(token),
            expiresAt: getSessionExpiry(deps.now()),
          });
          return { user: newUser, token };
        });
        reply.setCookie(SESSION_COOKIE_NAME, token, getSessionCookieOptions(deps.config.NODE_ENV));
        return reply.code(201).send({
          user: {
            id: user.id,
            email: user.email,
          },
        });
      }
    );

    app.post(
      '/login',
      {
        config: {
          rateLimit: {},
        },
      },
      async (request, reply) => {
        const { email, password } = loginRequestSchema.parse(request.body);

        const user = await findUserByEmail(deps.db, email);
        if (!user) {
          await verifyPasswordWithDummyHash(password);
          throw new HttpError(401, 'Invalid email or password');
        }

        const passwordValid = await verifyPassword(user.passwordHash, password);
        if (!passwordValid) throw new HttpError(401, 'Invalid email or password');

        const token = generateToken();
        await createSession(deps.db, {
          userId: user.id,
          tokenHash: hashToken(token),
          expiresAt: getSessionExpiry(deps.now()),
        });
        reply.setCookie(SESSION_COOKIE_NAME, token, getSessionCookieOptions(deps.config.NODE_ENV));
        return reply.code(200).send({
          user: {
            id: user.id,
            email: user.email,
          },
        });
      }
    );

    app.post('/logout', async (request, reply) => {
      const token = request.cookies[SESSION_COOKIE_NAME];
      if (token) {
        await deleteSession(deps.db, hashToken(token));
      }
      reply.clearCookie(SESSION_COOKIE_NAME, getSessionCookieOptions(deps.config.NODE_ENV));
      return reply.code(204).send();
    });
  };
}
