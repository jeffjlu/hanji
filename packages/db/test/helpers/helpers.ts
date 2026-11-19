import { expect } from 'vitest';

/** Valid, deterministic UUIDs: id(1), id(2), ... */


type PgErrorLike = { code?: string; constraint_name?: string };

/**
 * Asserts the query fails with a specific Postgres error. A bare
 * rejects.toThrow() would also pass for an unrelated failure.
 */
export async function expectPgError(
  promise: PromiseLike<unknown>,
  code: string,
  constraint?: string
): Promise<void> {
  const error = await Promise.resolve(promise).then(
    () => null,
    (e: unknown) => e
  );
  expect(error, 'expected the query to fail').not.toBeNull();
  // Drizzle wraps the driver error; the original is on `cause`.
  const pg = ((error as { cause?: PgErrorLike }).cause ?? error) as PgErrorLike;
  expect(pg.code).toBe(code);
  if (constraint !== undefined) expect(pg.constraint_name).toBe(constraint);
}

export const PG = {
  FOREIGN_KEY: '23503',
  UNIQUE: '23505',
  CHECK: '23514',
  RAISE: 'P0001',
} as const;
