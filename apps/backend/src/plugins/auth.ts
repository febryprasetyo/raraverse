import { timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';

function verifyBearerSecret(authHeader: string | undefined, expectedSecret: string): boolean {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }
  const token = authHeader.slice('Bearer '.length).trim();
  const tokenBuf = Buffer.from(token);
  const expectedBuf = Buffer.from(expectedSecret);
  if (tokenBuf.length !== expectedBuf.length) {
    return false;
  }
  return timingSafeEqual(tokenBuf, expectedBuf);
}

export function createBearerGuard(expectedSecret: string, roleLabel: string) {
  return async function bearerGuard(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    if (!verifyBearerSecret(request.headers.authorization, expectedSecret)) {
      await reply.status(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: `Missing or invalid ${roleLabel} credentials`,
        },
      });
    }
  };
}
