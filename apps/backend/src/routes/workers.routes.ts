import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { AppContainer } from '../container.js';

export function registerWorkerRoutes(
  app: FastifyInstance,
  workerGuard: preHandlerHookHandler,
  container?: AppContainer
): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  app.post('/api/v1/workers/heartbeat', { preHandler: [workerGuard] }, async () => ({
    ok: true,
    receivedAt: new Date().toISOString(),
  }));

  typed.post(
    '/api/v1/workers/session-expired',
    {
      preHandler: [workerGuard],
      schema: {
        body: z.object({
          publishJobId: z.string().uuid().optional(),
          platform: z.enum(['SHOPEE_VIDEO', 'TIKTOK_STUDIO']),
          reason: z.string().min(1).max(500),
        }),
        response: {
          200: z.object({ ok: z.literal(true) }),
        },
      },
    },
    async (request) => {
      if (request.body.publishJobId && container) {
        await container.publishJobs.updatePublishJob(request.body.publishJobId, {
          status: 'NEEDS_MANUAL_LOGIN',
          lastError: request.body.reason,
        });
      }
      if (container) {
        await container.telegramAlerts.notifySessionExpired(request.body.platform);
      }
      return { ok: true as const };
    }
  );
}
