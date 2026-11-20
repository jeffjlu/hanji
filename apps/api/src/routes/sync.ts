import { type FastifyInstance, type FastifyPluginAsync } from 'fastify';
import { syncRequestSchema, syncResponseSchema } from '@hanji/schemas';
import { type Deps } from '../deps.js';
import { HttpError } from '../errors.js';
import { validateEvents } from '../sync/validate-events.js';
import { syncForUser } from '../sync/sync-for-user.js';

const SYNC_BODY_LIMIT = 1_048_576; // sized for MAX_EVENTS_PER_REQUEST events

export function syncRoutes(deps: Deps): FastifyPluginAsync {
  return async (app: FastifyInstance) => {
    app.post('/sync', { bodyLimit: SYNC_BODY_LIMIT }, async (request) => {
      if (!request.user) throw new HttpError(401, 'Unauthorized');
      const envelope = syncRequestSchema.parse(request.body);

      const now = deps.now();
      const { rejected: invalid, valid } = validateEvents(envelope, now);

      const outcome = await deps.db.transaction((tx) =>
        syncForUser(tx, now, {
          userId: request.user!.id,
          deviceId: envelope.deviceId,
          sinceSeq: envelope.sinceSeq,
          events: valid,
        })
      );

      return syncResponseSchema.parse({
        accepted: outcome.accepted,
        rejected: [...invalid, ...outcome.rejected],
        cardStates: outcome.cardStates,
        serverSeq: outcome.serverSeq,
      });
    });
  };
}
