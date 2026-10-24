import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * Loads the nearest `.env` file, searching upward from `startDir`.
 * Variables already set in the environment (for example in CI) take precedence.
 * Returns the file loaded, or null if none was found.
 */
export function loadDotEnv(startDir: string = process.cwd()): string | null {
  let dir = resolve(startDir);
  for (;;) {
    const candidate = join(dir, '.env');
    if (existsSync(candidate)) {
      process.loadEnvFile(candidate);
      return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
