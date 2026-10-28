import Fastify from 'fastify';
import { errorHandler, HttpError, notFoundHandler } from './errors.js';
import { ZodError } from 'zod';
import { describe, it, expect } from 'vitest';
import { type ProblemDetails, type FieldProblem } from '@hanji/schemas';
import pinoTest from 'pino-test';
import { STATUS_CODES } from 'node:http';

type LogEntry = { level: number; msg: string; err?: unknown; url?: string };

async function assertErrorHandler(
  error: unknown,
  expectedStatus: number,
  expectedLogLevel: number,
  expectedLogMsg: string,
  responseOverrides?: (problem: ProblemDetails) => void,
  logOverrides?: (log: LogEntry) => void
) {
  const stream = pinoTest.sink();
  const app = Fastify({ logger: { stream } });
  app.setErrorHandler(errorHandler);

  app.get('/test', () => {
    throw error;
  });

  const response = await app.inject({ method: 'GET', url: '/test' });
  expect(response.statusCode).toBe(expectedStatus);
  const problem: ProblemDetails = response.json();
  expect(problem.type).toBe('about:blank');
  expect(problem.title).toBe(STATUS_CODES[expectedStatus]);
  expect(problem.status).toBe(expectedStatus);
  expect(problem.requestId).toBeDefined();
  responseOverrides?.(problem);

  await pinoTest.consecutive(stream, [
    (log: { level: number; msg: string }) => {
      expect(log.level).toBe(30);
      expect(log.msg).toBe('incoming request');
    },
    (log: LogEntry) => {
      expect(log.level).toBe(expectedLogLevel);
      expect(log.msg).toBe(expectedLogMsg);
      logOverrides?.(log);
    },
  ]);
}

describe('errorHandler', () => {
  it('should handle ZodError and return 400 status code', async () => {
    const zodError = new ZodError([
      {
        code: 'invalid_type',
        expected: 'string',
        path: ['user', 'name'],
        message: 'Expected string, received number',
      },
      {
        code: 'invalid_format',
        format: 'email',
        path: ['user', 'email'],
        message: 'Invalid email',
      },
    ]);

    await assertErrorHandler(
      zodError,
      400,
      40,
      'Client error',
      (problem) => {
        expect(problem.errors).toEqual<FieldProblem[]>([
          { field: 'user.name', message: 'Expected string, received number' },
          { field: 'user.email', message: 'Invalid email' },
        ]);
      },
      (log) => {
        expect(log.err).toMatchObject({
          type: 'ZodError',
          message: zodError.message,
        });
      }
    );
  });

  it('should handle HttpError and reply with status code and detail', async () => {
    const httpError = new HttpError(409, 'Conflict', [
      { field: 'email', message: 'is already registered' },
    ]);

    await assertErrorHandler(
      httpError,
      409,
      40,
      'Client error',
      (problem) => {
        expect(problem.detail).toBe('Conflict');
        expect(problem.errors).toEqual<FieldProblem[]>([
          { field: 'email', message: 'is already registered' },
        ]);
      },
      (log) => {
        expect(log.err).toMatchObject({
          type: 'HttpError',
          message: httpError.message,
        });
      }
    );
  });

  it('should handle unknown errors and return 500 status code', async () => {
    const unknownError = new Error('Unknown error');

    await assertErrorHandler(
      unknownError,
      500,
      50,
      'Internal server error',
      (problem) => {
        expect(problem.title).toBe('Internal Server Error');
      },
      (log) => {
        expect(log.err).toMatchObject({
          type: 'Error',
          message: 'Unknown error',
        });
      }
    );
  });

  it('should handle HttpError without detail or errors and return 400 status code', async () => {
    const httpError = new HttpError(400);

    await assertErrorHandler(
      httpError,
      400,
      40,
      'Client error',
      (problem) => {
        expect(problem.detail).toBeUndefined();
        expect(problem.errors).toBeUndefined();
      },
      (log) => {
        expect(log.err).toMatchObject({
          type: 'HttpError',
          message: httpError.message,
        });
      }
    );
  });

  it('should handle non-Error objects and return 500 status code', async () => {
    const nonError = { message: 'This is not an error object' };

    await assertErrorHandler(nonError, 500, 50, 'Internal server error', undefined, (log) => {
      expect(log.err).toMatchObject({
        message: 'This is not an error object',
      });
    });
  });

  it('should handle NotFound errors and return 404 status code', async () => {
    const stream = pinoTest.sink();
    const app = Fastify({ logger: { stream } });
    app.setErrorHandler(errorHandler);
    app.setNotFoundHandler(notFoundHandler);

    const response = await app.inject({ method: 'GET', url: '/notFound' });
    expect(response.statusCode).toBe(404);
    const problem: ProblemDetails = response.json();
    expect(problem.type).toBe('about:blank');
    expect(problem.title).toBe(STATUS_CODES[404]);
    expect(problem.status).toBe(404);
    expect(problem.requestId).toBeDefined();

    await pinoTest.consecutive(stream, [
      (log: { level: number; msg: string }) => {
        expect(log.level).toBe(30);
        expect(log.msg).toBe('incoming request');
      },
      (log: LogEntry) => {
        expect(log.level).toBe(40);
        expect(log.msg).toBe('Not found');
        expect(log.url).toBe('/notFound');
      },
    ]);
  });
});
