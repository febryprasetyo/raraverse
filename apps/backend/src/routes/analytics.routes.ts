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
                provider: z.enum(['meta', 'youtube', 'lnkbio', 'threads']),
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
    async () => {
      let lnkBioStatus: 'HEALTHY' | 'EXPIRING_SOON' | 'NEEDS_REAUTH' = 'HEALTHY';
      let lnkBioDays = 30;
      if (container.oauthTokens?.getTokenByProvider) {
        const tok = await container.oauthTokens.getTokenByProvider('lnkbio');
        if (tok) {
          lnkBioDays = Math.max(
            0,
            Math.ceil((tok.expiresAt.getTime() - Date.now()) / 86400_000)
          );
          lnkBioStatus = tok.needsReauth
            ? 'NEEDS_REAUTH'
            : lnkBioDays <= 7
              ? 'EXPIRING_SOON'
              : 'HEALTHY';
        }
      }

      let threadsStatus: 'HEALTHY' | 'EXPIRING_SOON' | 'NEEDS_REAUTH' =
        container.env.THREADS_ACCESS_TOKEN ? 'HEALTHY' : 'NEEDS_REAUTH';
      let threadsDays = container.env.THREADS_ACCESS_TOKEN ? 60 : 0;
      if (container.env.THREADS_MODE === 'mock' && !container.env.THREADS_ACCESS_TOKEN) {
        threadsStatus = 'HEALTHY';
        threadsDays = 60;
      } else if (container.oauthTokens?.getTokenByProvider) {
        const tTok = await container.oauthTokens.getTokenByProvider('threads');
        if (tTok) {
          threadsDays = Math.max(
            0,
            Math.ceil((tTok.expiresAt.getTime() - Date.now()) / 86400_000)
          );
          threadsStatus = tTok.needsReauth
            ? 'NEEDS_REAUTH'
            : threadsDays <= 7
              ? 'EXPIRING_SOON'
              : 'HEALTHY';
        }
      }

      return {
        apiStatus: 'OK' as const,
        dataSourceMode: container.env.DATA_SOURCE_MODE,
        workerOnline: true,
        lastHeartbeatAt: new Date().toISOString(),
        oauthProviders: [
          { provider: 'meta' as const, status: 'HEALTHY' as const, expiresInDays: 45 },
          { provider: 'youtube' as const, status: 'HEALTHY' as const, expiresInDays: 30 },
          {
            provider: 'lnkbio' as const,
            status: lnkBioStatus,
            expiresInDays: lnkBioDays,
          },
          {
            provider: 'threads' as const,
            status: threadsStatus,
            expiresInDays: threadsDays,
          },
        ],
        playwrightSessions: [
          { platform: 'SHOPEE_VIDEO' as const, status: 'READY' as const },
          { platform: 'TIKTOK_STUDIO' as const, status: 'READY' as const },
        ],
      };
    }
  );
}
