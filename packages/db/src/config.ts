import { z } from 'zod';

export type Env = Record<string, string | undefined>;

export const requiredString = z
  .string({ error: (issue) => (issue.input === undefined ? 'is required' : 'must be a string') })
  .min(1, 'is required');

function isPostgresUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === 'postgres:' || protocol === 'postgresql:';
  } catch {
    return false;
  }
}

/** What the database tooling (drizzle-kit, migrations) needs. */
export const dbConfigSchema = z.object({
  DATABASE_URL: requiredString.refine(isPostgresUrl, 'must be a postgres:// or postgresql:// URL'),
});

export type DbConfig = z.output<typeof dbConfigSchema>;

export type ConfigIssue = { name: string; problem: string };

/** Thrown when environment variables are missing or malformed. Never contains values. */
export class ConfigError extends Error {
  readonly issues: ConfigIssue[];

  constructor(issues: ConfigIssue[]) {
    super(
      ['Invalid configuration:', ...issues.map((i) => `  - ${i.name}: ${i.problem}`)].join('\n')
    );
    this.name = 'ConfigError';
    this.issues = issues;
  }
}

export function parseEnv<S extends z.ZodType>(schema: S, env: Env): z.output<S> {
  const result = schema.safeParse(env);
  if (result.success) return result.data;

  // Report each variable once, using only our own messages (never the raw value).
  const seen = new Set<string>();
  const issues: ConfigIssue[] = [];
  for (const issue of result.error.issues) {
    const name = String(issue.path[0] ?? '(config)');
    if (seen.has(name)) continue;
    seen.add(name);
    issues.push({ name, problem: issue.message });
  }
  throw new ConfigError(issues);
}

export function loadDbConfig(env: Env = process.env): DbConfig {
  return parseEnv(dbConfigSchema, env);
}
