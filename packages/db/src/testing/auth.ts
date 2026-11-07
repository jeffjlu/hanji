import { count } from 'drizzle-orm';
import { type Executor } from '../queries/executor.js';
import { session } from '../schema/auth.js';

export function findSessionsByUserId(executor: Executor, userId: string) {
  return executor.query.session.findMany({
    where: (session, { eq }) => eq(session.userId, userId),
  });
}

export async function findSessionCount(executor: Executor) {
  const [result] = await executor.select({ count: count() }).from(session);
  return result!.count;
}
