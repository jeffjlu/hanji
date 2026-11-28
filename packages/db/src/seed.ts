/**
 * `pnpm db:seed [file]` — validates a seed file, then upserts it.
 *
 * File: the argument, else SEED_FILE, else packages/db/seed/seed.json.
 * Relative paths resolve from where `pnpm` was run (INIT_CWD).
 * The seed is validated before any database connection is opened.
 */
import { resolve } from 'node:path';
import { ConfigError, loadDbConfig } from './config.js';
import { createDb } from './client.js';
import { loadDotEnv } from './load-env.js';
import { DEFAULT_SEED_FILE, type LoadSeedResult, loadSeed, readSeedFile } from './seed/load.js';
import { SeedError } from './seed/schema.js';

async function main(args: string[]): Promise<void> {
  const requested = args.find((a) => a !== '--') ?? process.env['SEED_FILE'];
  const file = requested
    ? resolve(process.env['INIT_CWD'] ?? process.cwd(), requested)
    : DEFAULT_SEED_FILE;

  const seed = readSeedFile(file); // throws before the database is touched

  loadDotEnv();
  const config = loadDbConfig();
  const { db, close } = createDb(config.DATABASE_URL, { max: 1 });
  try {
    report(file, await loadSeed(db, seed));
  } finally {
    await close();
  }
}

function report(file: string, result: LoadSeedResult): void {
  const { counts, written, orphans } = result;
  console.log(`Seed: ${file}`);
  console.log(
    `Loaded ${counts.units} units, ${counts.entries} entries, ${counts.kanji} kanji, ${counts.cards} cards ` +
      `(rows written: ${written.units}, ${written.entries}, ${written.kanji}, ${written.cards}).`
  );
  console.log(
    `Content version ${result.versionHash.slice(0, 12)}… ${result.versionChanged ? '(new)' : '(unchanged)'}`
  );
  for (const [table, ids] of Object.entries(orphans)) {
    if (ids.length === 0) continue;
    console.warn(
      `Warning: ${ids.length} ${table} in the database are not in the seed and were left in place:`
    );
    for (const id of ids) console.warn(`  - ${id}`);
  }
}

main(process.argv.slice(2)).catch((err: unknown) => {
  console.error(err instanceof SeedError || err instanceof ConfigError ? err.message : err);
  process.exitCode = 1;
});
