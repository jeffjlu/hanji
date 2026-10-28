import { type FastifyReply, type FastifyRequest } from 'fastify';
import { type ProblemDetails, type FieldProblem } from '@hanji/schemas';
import { ZodError } from 'zod';
import { STATUS_CODES } from 'node:http';

export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly detail?: string,
    readonly errors?: FieldProblem[]
  ) {
    super(detail ?? STATUS_CODES[statusCode] ?? 'Error');
    this.name = 'HttpError';
  }
}

function statusOf(error: unknown): number {
  if (error instanceof ZodError) {
    return 400;
  } else if (error instanceof HttpError) {
    return error.statusCode;
  } else {
    return 500;
  }
}

function sendProblem(
  request: FastifyRequest,
  reply: FastifyReply,
  status: number,
  extra: Pick<ProblemDetails, 'detail' | 'errors'> = {}
) {
  const problem: ProblemDetails = {
    type: 'about:blank',
    title: STATUS_CODES[status] ?? 'Unknown error',
    status,
    requestId: request.id,
    ...extra,
  };
  reply.code(status).type('application/problem+json').send(problem);
}

export function errorHandler(error: unknown, request: FastifyRequest, reply: FastifyReply) {
  const status = statusOf(error);

  if (status >= 500) {
    request.log.error({ err: error }, 'Internal server error');
  } else {
    request.log.warn({ err: error }, 'Client error');
  }

  if (error instanceof ZodError) {
    const fieldProblems: FieldProblem[] = error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));
    sendProblem(request, reply, status, { errors: fieldProblems });
  } else if (error instanceof HttpError) {
    sendProblem(request, reply, status, { detail: error.detail, errors: error.errors });
  } else {
    sendProblem(request, reply, status);
  }
}
