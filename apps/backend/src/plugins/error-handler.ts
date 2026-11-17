import type { FastifyError, FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

/**
 * Registers a centralized error handler that strips internal stack traces
 * and returns a consistent API error envelope.
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError | ZodError | Error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
      });
    }

    const statusCode =
      'statusCode' in error && typeof error.statusCode === 'number'
        ? error.statusCode
        : 500;

    const code = statusCode >= 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_ERROR';
    const message =
      statusCode >= 500 ? 'An unexpected internal error occurred' : error.message;

    if (statusCode >= 500) {
      app.log.error(error);
    }

    return reply.status(statusCode).send({
      error: {
        code,
        message,
        details: [],
      },
    });
  });
}
