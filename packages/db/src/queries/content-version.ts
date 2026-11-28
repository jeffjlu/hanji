import { desc } from 'drizzle-orm';
import { contentVersion } from '../schema/content.js';
import { type Executor } from './executor.js';

/** The most recently loaded content version hash, or null before the first seed. */
export async function getCurrentContentVersion(executor: Executor): Promise<string | null> {
  const [row] = await executor
    .select({ versionHash: contentVersion.versionHash })
    .from(contentVersion)
    .orderBy(desc(contentVersion.loadedAt), desc(contentVersion.versionHash))
    .limit(1);
  return row?.versionHash ?? null;
}
