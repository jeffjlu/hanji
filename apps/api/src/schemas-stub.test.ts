import { problemDetailsSchema } from '@hanji/schemas';
import { describe, expect, it } from 'vitest';
import {
  buildHealthReply,
  parseLoginBody,
  parseRegisterBody,
  toCurrentUser,
} from './schemas-stub.js';

describe('api schema stub', () => {
  it('builds health replies that match the shared contract', () => {
    expect(buildHealthReply(true)).toEqual({ statusCode: 200, body: { status: 'ok', db: 'up' } });
    expect(buildHealthReply(false)).toEqual({
      statusCode: 503,
      body: { status: 'degraded', db: 'down' },
    });
  });

  it('accepts a valid register body and normalises the email', () => {
    const result = parseRegisterBody({
      email: ' Learner@Example.com ',
      password: 'correct horse battery',
      inviteCode: 'let-me-in',
    });
    expect(result).toEqual({
      ok: true,
      data: {
        email: 'learner@example.com',
        password: 'correct horse battery',
        inviteCode: 'let-me-in',
      },
    });
  });

  it('turns validation failures into problem+json with field-level errors', () => {
    const result = parseRegisterBody({ email: 'nope', password: 'short', inviteCode: '' }, 'req-1');
    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.status).toBe(400);
    expect(problemDetailsSchema.safeParse(result.problem).success).toBe(true);
    expect(result.problem.requestId).toBe('req-1');
    expect(result.problem.errors?.map((e) => e.field).sort()).toEqual([
      'email',
      'inviteCode',
      'password',
    ]);
  });

  it('login accepts a short password but not an empty one', () => {
    expect(parseLoginBody({ email: 'a@b.co', password: 'x' }).ok).toBe(true);
    expect(parseLoginBody({ email: 'a@b.co', password: '' }).ok).toBe(false);
  });

  it('never leaks the password hash or sync counter in the current-user reply', () => {
    const user = toCurrentUser({
      id: '3f2b8c1e-5d4a-4e7b-9a1c-2d3e4f5a6b7c',
      email: 'a@b.co',
      passwordHash: '$argon2id$...',
      lastSeq: 7,
    });
    expect(user).toEqual({ id: '3f2b8c1e-5d4a-4e7b-9a1c-2d3e4f5a6b7c', email: 'a@b.co' });
    expect(Object.keys(user)).not.toContain('passwordHash');
  });
});
