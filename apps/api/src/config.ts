import { z } from 'zod';
import { type Env, dbConfigSchema, parseEnv, requiredString } from '@hanji/db';

const PLACEHOLDER_PREFIX = 'change-me';

function isOrigin(value: string): boolean {
  try {
    return new URL(value).origin === value;
  } catch {
    return false;
  }
}

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
    PORT: z.coerce
      .number({ error: 'must be a number' })
      .int('must be a whole number')
      .min(1, 'must be between 1 and 65535')
      .max(65535, 'must be between 1 and 65535')
      .default(3000),
  })
  .refine(
    (c) => !(c.NODE_ENV === 'production' && c.SESSION_SECRET.startsWith(PLACEHOLDER_PREFIX)),
    { path: ['SESSION_SECRET'], error: 'must not be the .env.example placeholder in production' }
  );

export type Config = z.output<typeof configSchema>;

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
