/**
 * Runs `src/seed.ts` as a process. DATABASE_URL points at a closed port, so a
 * validation message (not a connection error) proves the seed is checked
 * before the database is touched.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SEED_FILE } from './load.js';

const packageDir = join(import.meta.dirname, '..', '..');
const UNREACHABLE = 'postgres://nobody:nothing@127.0.0.1:1/none';

function runSeed(file: string) {
  return spawnSync('pnpm', ['exec', 'tsx', 'src/seed.ts', file], {
    cwd: packageDir,
    env: { ...process.env, DATABASE_URL: UNREACHABLE, INIT_CWD: packageDir },
    encoding: 'utf8',
    timeout: 30_000,
  });
}

function writeSeed(mutate: (seed: { cards: Record<string, unknown>[] }) => void): string {
  const seed = JSON.parse(readFileSync(DEFAULT_SEED_FILE, 'utf8')) as {
    cards: Record<string, unknown>[];
  };
  mutate(seed);
  const file = join(mkdtempSync(join(tmpdir(), 'hanji-seed-')), 'seed.json');
  writeFileSync(file, JSON.stringify(seed));
  return file;
}

describe('pnpm db:seed', () => {
  it('rejects a card with both entry and kanji before connecting', () => {
    const file = writeSeed((s) => (s.cards[0]!['kanji'] = '水'));
    const result = runSeed(file);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Invalid seed file ${file}`);
    expect(result.stderr).toContain('cards[0]: must reference exactly one of entry or kanji');
    expect(result.stderr).not.toMatch(/ECONNREFUSED|connect/i);
  });

  it('rejects a seed with a missing field before connecting', () => {
    const file = writeSeed((s) => delete s.cards[0]!['unit']);
    const result = runSeed(file);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('cards[0].unit:');
    expect(result.stderr).not.toMatch(/ECONNREFUSED/);
  });

  it('reports a missing file clearly', () => {
    const result = runSeed('does-not-exist.json');
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/Cannot read seed file .*does-not-exist\.json/);
  });

  it('reports invalid JSON clearly', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'hanji-seed-')), 'seed.json');
    writeFileSync(file, '{ "format": ');
    const result = runSeed(file);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/is not valid JSON/);
  });
});
