import { DefaultScheduler } from 'ts-fsrs';

export const FSRS_VERSION = 'FSRS-6';

export type Scheduler = Awaited<ReturnType<typeof DefaultScheduler<'FSRS-6'>>>;
export type FsrsCard = ReturnType<Scheduler['newCard']>;

export async function createScheduler(retention: number): Promise<Scheduler> {
  return DefaultScheduler({
    version: FSRS_VERSION,
    desiredRetention: retention,
    enableFuzz: false,
  });
}

export async function buildSchedulers(
  retentions: Iterable<number>
): Promise<(r: number) => Scheduler> {
  const cache = new Map<number, Scheduler>();
  for (const r of new Set(retentions)) cache.set(r, await createScheduler(r));
  return (r) => {
    const s = cache.get(r);
    if (!s) throw new Error(`No scheduler for retention ${r}`);
    return s;
  };
}
