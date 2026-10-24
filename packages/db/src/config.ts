import { z } from 'zod';

type Env = Record<string, string | undefined>;

const PLACEHOLDER_PREFIX = 'change-me';

const requiredString = z
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

function isOrigin(value: string): boolean {
  try {
    return new URL(value).origin === value;
  } catch {
    return false;
  }
}

/** What the database tooling (drizzle-kit, migrations) needs. */
export const dbConfigSchema = z.object({
  DATABASE_URL: requiredString.refine(isPostgresUrl, 'must be a postgres:// or postgresql:// URL'),
});

/** Everything the API needs at startup. */
export const configSchema = dbConfigSchema
  .extend({
    NODE_ENV: z
      .enum(['development', 'test', 'production'], {
        error: 'must be one of development, test, production',
      })
      .default('development'),
    SESSION_SECRET: requiredString.min(32, 'must be at least 32 characters'),
    WEB_ORIGIN: requiredString.refine(
      isOrigin,
      'must be an origin such as http://localhost:5173 (no path, no trailing slash)'
    ),
    REGISTRATION_CODE: requiredString.min(8, 'must be at least 8 characters'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  })
  .refine(
    (c) => !(c.NODE_ENV === 'production' && c.SESSION_SECRET.startsWith(PLACEHOLDER_PREFIX)),
    { path: ['SESSION_SECRET'], error: 'must not be the .env.example placeholder in production' }
  );

export type DbConfig = z.output<typeof dbConfigSchema>;
export type Config = z.output<typeof configSchema>;

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

function parseEnv<S extends z.ZodType>(schema: S, env: Env): z.output<S> {
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

export function loadConfig(env: Env = process.env): Config {
  return parseEnv(configSchema, env);
}

function redactUrl(value: string): string {
  const url = new URL(value);
  if (url.password) url.password = 'redacted';
  return url.toString();
}

/** A version of the config that is safe to write to logs. */
export function redactConfig(config: Config): Record<string, string> {
  return {
    NODE_ENV: config.NODE_ENV,
    DATABASE_URL: redactUrl(config.DATABASE_URL),
    WEB_ORIGIN: config.WEB_ORIGIN,
    SESSION_SECRET: '[redacted]',
    REGISTRATION_CODE: '[redacted]',
    PORT: String(config.PORT),
  };
}
