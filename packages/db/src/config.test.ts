import { describe, expect, it } from 'vitest';
import { loadDbConfig } from './config.js';

const valid = {
  DATABASE_URL: 'postgres://user:pw@localhost:5432/app',
};

describe('loadDbConfig', () => {
  it('needs only DATABASE_URL', () => {
    expect(loadDbConfig({ DATABASE_URL: valid.DATABASE_URL }).DATABASE_URL).toBe(
      valid.DATABASE_URL
    );
  });

  it('names DATABASE_URL when missing', () => {
    expect(() => loadDbConfig({})).toThrow(/DATABASE_URL: is required/);
  });
});
