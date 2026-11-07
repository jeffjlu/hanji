import { type Executor } from '../queries/executor.js';

export function findSessionsByUserId(executor: Executor, userId: string) {
  return executor.query.session.findMany({
    where: (session, { eq }) => eq(session.userId, userId),
  });
}
