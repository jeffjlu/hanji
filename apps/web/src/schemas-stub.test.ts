import { PASSWORD_MIN_LENGTH } from '@hanji/schemas';
import { describe, expect, it } from 'vitest';
import {
  fieldErrorsFromProblem,
  parseCurrentUser,
  parseHealth,
  passwordHint,
  validateLoginForm,
  validateRegisterForm,
} from './schemas-stub';

describe('web schema stub', () => {
  it('validates the register form and normalises the email', () => {
    const result = validateRegisterForm({
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

  it('returns one message per invalid field', () => {
    const result = validateRegisterForm({ email: 'nope', password: 'short', inviteCode: '' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors).sort()).toEqual(['email', 'inviteCode', 'password']);
  });

  it('login only requires a non-empty password', () => {
    expect(validateLoginForm({ email: 'a@b.co', password: 'x' }).ok).toBe(true);
    expect(validateLoginForm({ email: 'a@b.co', password: '' }).ok).toBe(false);
  });

  it('reads field errors from an API problem body, and ignores anything else', () => {
    const problem = {
      type: 'about:blank',
      title: 'Bad Request',
      status: 400,
      errors: [
        { field: 'email', message: 'Already registered' },
        { field: 'email', message: 'second message is ignored' },
      ],
    };
    expect(fieldErrorsFromProblem(problem)).toEqual({ email: 'Already registered' });
    expect(fieldErrorsFromProblem({ unexpected: true })).toEqual({});
  });

  it('parses current-user and health bodies, returning null for bad ones', () => {
    expect(
      parseCurrentUser({ id: '3f2b8c1e-5d4a-4e7b-9a1c-2d3e4f5a6b7c', email: 'a@b.co' })
    ).toEqual({
      id: '3f2b8c1e-5d4a-4e7b-9a1c-2d3e4f5a6b7c',
      email: 'a@b.co',
    });
    expect(parseCurrentUser({ id: 'not-a-uuid', email: 'a@b.co' })).toBeNull();
    expect(parseHealth({ status: 'ok', db: 'up' })).toEqual({ status: 'ok', db: 'up' });
    expect(parseHealth({ status: 'ok' })).toBeNull();
  });

  it('shares the password length constant with the API', () => {
    expect(passwordHint).toBe(`At least ${PASSWORD_MIN_LENGTH} characters`);
  });
});
