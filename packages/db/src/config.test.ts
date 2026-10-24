import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig, loadDbConfig, redactConfig } from './config.js';

const valid = {
  DATABASE_URL: 'postgres://user:pw@localhost:5432/app',
  SESSION_SECRET: 'x'.repeat(32),
  WEB_ORIGIN: 'http://localhost:5173',
  REGISTRATION_CODE: 'invite-code-1',
  NODE_ENV: 'test',
};

function messageFor(env: Record<string, string | undefined>): string {
  try {
    loadConfig(env);
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigError);
    return (error as ConfigError).message;
  }
  throw new Error('expected loadConfig to throw');
}

describe('loadConfig', () => {
  it('accepts a valid environment', () => {
    expect(loadConfig(valid).WEB_ORIGIN).toBe('http://localhost:5173');
  });

  it('defaults NODE_ENV to development', () => {
    const { NODE_ENV: _omitted, ...rest } = valid;
    expect(loadConfig(rest).NODE_ENV).toBe('development');
  });

  it.each(['DATABASE_URL', 'SESSION_SECRET', 'WEB_ORIGIN', 'REGISTRATION_CODE'])(
    'names %s when it is missing',
    (name) => {
      const env: Record<string, string | undefined> = { ...valid };
      delete env[name];
      expect(messageFor(env)).toContain(`${name}: is required`);
    },
  );

  it('treats an empty value as missing', () => {
    expect(messageFor({ ...valid, SESSION_SECRET: '' })).toContain('SESSION_SECRET: is required');
  });

  it.each([
    ['DATABASE_URL', 'mysql://u:p@localhost/db'],
    ['DATABASE_URL', 'not a url'],
    ['SESSION_SECRET', 'too-short'],
    ['WEB_ORIGIN', 'http://localhost:5173/app'],
    ['WEB_ORIGIN', 'http://localhost:5173/'],
    ['REGISTRATION_CODE', 'short'],
    ['NODE_ENV', 'staging'],
  ])('names %s when the value %j is malformed', (name, value) => {
    expect(messageFor({ ...valid, [name]: value })).toContain(name);
  });

  it('reports every bad variable, once each', () => {
    const message = messageFor({ ...valid, SESSION_SECRET: '', WEB_ORIGIN: 'nope' });
    expect(message.match(/SESSION_SECRET/g)).toHaveLength(1);
    expect(message).toContain('WEB_ORIGIN');
  });

  it('never echoes values in error messages', () => {
    const message = messageFor({
      ...valid,
      DATABASE_URL: 'mysql://user:hunter2@host/db',
      SESSION_SECRET: 'distinctive-short-secret',
      REGISTRATION_CODE: 'abc',
    });
    for (const secret of ['hunter2', 'distinctive-short-secret', 'abc']) {
      expect(message).not.toContain(secret);
    }
  });

  it('rejects the .env.example session secret in production', () => {
    const env = { ...valid, NODE_ENV: 'production', SESSION_SECRET: `change-me-${'x'.repeat(30)}` };
    expect(messageFor(env)).toContain('SESSION_SECRET');
  });
});

describe('loadDbConfig', () => {
  it('needs only DATABASE_URL', () => {
    expect(loadDbConfig({ DATABASE_URL: valid.DATABASE_URL }).DATABASE_URL).toBe(valid.DATABASE_URL);
  });

  it('names DATABASE_URL when missing', () => {
    expect(() => loadDbConfig({})).toThrow(/DATABASE_URL: is required/);
  });
});

describe('redactConfig', () => {
  it('hides secrets and the database password', () => {
    const redacted = JSON.stringify(redactConfig(loadConfig(valid)));
    expect(redacted).not.toContain('pw@');
    expect(redacted).not.toContain(valid.SESSION_SECRET);
    expect(redacted).not.toContain(valid.REGISTRATION_CODE);
    expect(redacted).toContain('localhost:5432/app');
  });
});