import type { FastifyInstance, preHandlerHookHandler } from 'fastify';

export function registerWorkerRoutes(
  app: FastifyInstance,
  workerGuard: preHandlerHookHandler
): void {
  app.post('/api/v1/workers/heartbeat', { preHandler: [workerGuard] }, async () => ({
    ok: true,
    receivedAt: new Date().toISOString(),
  }));
}
