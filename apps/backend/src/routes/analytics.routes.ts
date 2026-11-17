import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { WeeklyEvaluationReportSchema } from '@ebieshop/shared';
import { z } from 'zod';
import type { AppContainer } from '../container.js';

export function registerAnalyticsRoutes(
  app: FastifyInstance,
  container: AppContainer,
  adminGuard: preHandlerHookHandler
): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/api/v1/analytics/weekly',
    {
      preHandler: [adminGuard],
      schema: {
        response: {
          200: WeeklyEvaluationReportSchema,
        },
      },
    },
    async () => container.analytics.getLatestWeeklyEvaluation()
  );

  typed.get(
    '/api/v1/system/health',
    {
      preHandler: [adminGuard],
      schema: {
        response: {
          200: z.object({
            apiStatus: z.literal('OK'),
            dataSourceMode: z.string(),
            workerOnline: z.boolean(),
            lastHeartbeatAt: z.string().datetime(),
            oauthProviders: z.array(
              z.object({
                provider: z.enum(['meta', 'youtube']),
                status: z.enum(['HEALTHY', 'EXPIRING_SOON', 'NEEDS_REAUTH']),
                expiresInDays: z.number().int(),
              })
            ),
            playwrightSessions: z.array(
              z.object({
                platform: z.enum(['SHOPEE_VIDEO', 'TIKTOK_STUDIO']),
                status: z.enum(['READY', 'NEEDS_MANUAL_LOGIN']),
              })
            ),
          }),
        },
      },
    },
    async () => ({
      apiStatus: 'OK' as const,
      dataSourceMode: container.env.DATA_SOURCE_MODE,
      workerOnline: true,
      lastHeartbeatAt: new Date().toISOString(),
      oauthProviders: [
        { provider: 'meta' as const, status: 'HEALTHY' as const, expiresInDays: 45 },
        { provider: 'youtube' as const, status: 'HEALTHY' as const, expiresInDays: 30 },
      ],
      playwrightSessions: [
        { platform: 'SHOPEE_VIDEO' as const, status: 'READY' as const },
        { platform: 'TIKTOK_STUDIO' as const, status: 'READY' as const },
      ],
    })
  );
}
