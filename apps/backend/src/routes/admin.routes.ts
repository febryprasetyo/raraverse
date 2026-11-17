import type { FastifyInstance, preHandlerHookHandler } from 'fastify';

export function registerAdminRoutes(
  app: FastifyInstance,
  adminGuard: preHandlerHookHandler
): void {
  app.get('/api/v1/admin/ping', { preHandler: [adminGuard] }, async () => ({
    ok: true,
    role: 'admin',
  }));
}
