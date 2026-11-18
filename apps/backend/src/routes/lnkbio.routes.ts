import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  AffiliateLinkSchema,
  LnkBioAccountProfileSchema,
  LnkBioMetricsSnapshotSchema,
  LnkBioOverviewSchema,
  LnkBioSyncLogSchema,
  LnkBioSyncOperationSchema,
  ProductSchema,
} from '@ebieshop/shared';
import { z } from 'zod';
import type { AppContainer } from '../container.js';
import { BadRequestError, NotFoundError } from '../errors.js';

export function registerLnkBioRoutes(
  app: FastifyInstance,
  container: AppContainer,
  adminGuard: preHandlerHookHandler
): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // Public Hybrid Click Tracker Redirect Endpoint
  typed.get(
    '/r/:code',
    {
      schema: {
        params: z.object({
          code: z.string().regex(/^[A-Za-z0-9_-]{3,32}$/),
        }),
        querystring: z.object({
          utm_source: z.string().max(64).optional(),
          utm_medium: z.string().max(64).optional(),
          utm_campaign: z.string().max(64).optional(),
          utm_content: z.string().max(64).optional(),
          utm_term: z.string().max(64).optional(),
        }),
      },
    },
    async (request, reply) => {
      const { destinationUrl } = await container.lnkBioAutomation.recordRedirectClick(
        request.params.code,
        request.query
      );
      return reply.redirect(destinationUrl, 302);
    }
  );

  typed.get(
    '/api/v1/lnkbio/overview',
    {
      preHandler: [adminGuard],
      schema: {
        response: {
          200: LnkBioOverviewSchema,
        },
      },
    },
    async () => container.lnkBioAutomation.getOverview()
  );

  typed.get(
    '/api/v1/lnkbio/auth/authorize-url',
    {
      preHandler: [adminGuard],
      schema: {
        querystring: z.object({
          redirectUri: z.string().url().optional(),
        }),
        response: {
          200: z.object({
            authorizeUrl: z.string().url(),
            state: z.string().min(1),
          }),
        },
      },
    },
    async (request) =>
      container.lnkBioAutomation.getAuthorizeUrl(request.query.redirectUri)
  );

  typed.post(
    '/api/v1/lnkbio/auth/connect',
    {
      preHandler: [adminGuard],
      schema: {
        body: z.object({
          mode: z.enum(['client_credentials', 'authorization_code']).default('client_credentials'),
          code: z.string().min(1).optional(),
          redirectUri: z.string().url().optional(),
        }),
        response: {
          200: z.object({
            connected: z.literal(true),
            profile: LnkBioAccountProfileSchema,
            expiresAt: z.string().datetime(),
          }),
        },
      },
    },
    async (request) => {
      if (request.body.mode === 'authorization_code' && !request.body.code) {
        throw new BadRequestError('Parameter code wajib diisi untuk authorization_code flow');
      }
      return container.lnkBioAutomation.connectOAuth(request.body);
    }
  );

  typed.post(
    '/api/v1/lnkbio/sync',
    {
      preHandler: [adminGuard],
      schema: {
        body: z.object({}).optional(),
        response: {
          200: z.object({
            syncedLinks: z.number().int().nonnegative(),
            groupsCount: z.number().int().nonnegative(),
            snapshotsCreated: z.number().int().nonnegative(),
            profile: LnkBioAccountProfileSchema,
          }),
        },
      },
    },
    async () => container.lnkBioAutomation.syncRemoteLinksAndMetrics()
  );

  typed.post(
    '/api/v1/lnkbio/links/:productId/publish',
    {
      preHandler: [adminGuard],
      schema: {
        params: z.object({ productId: z.string().uuid() }),
        body: z
          .object({
            title: z.string().min(1).max(255).optional(),
            groupId: z.string().min(1).nullable().optional(),
            scheduleFrom: z.string().datetime({ offset: true }).nullable().optional(),
            scheduleTo: z.string().datetime({ offset: true }).nullable().optional(),
            position: z.number().int().nonnegative().optional(),
          })
          .optional(),
        response: {
          200: z.object({
            link: AffiliateLinkSchema,
            product: ProductSchema,
          }),
        },
      },
    },
    async (request) => {
      const product = await container.products.getProductById(request.params.productId);
      if (!product) {
        throw new NotFoundError(`Product '${request.params.productId}' not found`);
      }
      return container.lnkBioAutomation.publishOrUpdateProductLink({
        product,
        overrideTitle: request.body?.title,
        groupId: request.body?.groupId,
        scheduleFrom: request.body?.scheduleFrom,
        scheduleTo: request.body?.scheduleTo,
        position: request.body?.position,
      });
    }
  );

  typed.delete(
    '/api/v1/lnkbio/links/:productId',
    {
      preHandler: [adminGuard],
      schema: {
        params: z.object({ productId: z.string().uuid() }),
        response: {
          200: z.object({
            deleted: z.literal(true),
            productId: z.string().uuid(),
          }),
        },
      },
    },
    async (request) =>
      container.lnkBioAutomation.deleteProductLink(request.params.productId)
  );

  typed.post(
    '/api/v1/lnkbio/reorder',
    {
      preHandler: [adminGuard],
      schema: {
        body: z.object({
          orderedProductIds: z.array(z.string().uuid()).min(1),
          groupId: z.string().min(1).optional(),
        }),
        response: {
          200: z.object({
            reorderedCount: z.number().int().nonnegative(),
            links: z.array(AffiliateLinkSchema),
          }),
        },
      },
    },
    async (request) => container.lnkBioAutomation.reorderProductLinks(request.body)
  );

  typed.get(
    '/api/v1/lnkbio/logs',
    {
      preHandler: [adminGuard],
      schema: {
        querystring: z.object({
          limit: z.coerce.number().int().positive().max(200).optional(),
          operation: LnkBioSyncOperationSchema.optional(),
          status: z.enum(['SUCCESS', 'FAILED']).optional(),
        }),
        response: {
          200: z.object({
            items: z.array(LnkBioSyncLogSchema),
          }),
        },
      },
    },
    async (request) => ({
      items: await container.lnkBioAutomation.listLogs(request.query),
    })
  );

  typed.get(
    '/api/v1/lnkbio/metrics',
    {
      preHandler: [adminGuard],
      schema: {
        querystring: z.object({
          productId: z.string().uuid().optional(),
          limit: z.coerce.number().int().positive().max(200).optional(),
        }),
        response: {
          200: z.object({
            items: z.array(LnkBioMetricsSnapshotSchema),
          }),
        },
      },
    },
    async (request) => ({
      items: await container.lnkBioAutomation.listMetrics(request.query),
    })
  );
}
