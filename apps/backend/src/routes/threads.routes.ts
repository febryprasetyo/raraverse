import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  ProductSchema,
  ThreadsAccountProfileSchema,
  ThreadsMediaTypeSchema,
  ThreadsOverviewSchema,
  ThreadsPostRecordSchema,
  ThreadsSyncLogSchema,
  ThreadsSyncOperationSchema,
} from '@ebieshop/shared';
import { z } from 'zod';
import type { AppContainer } from '../container.js';
import { BadRequestError } from '../errors.js';

export function registerThreadsRoutes(
  app: FastifyInstance,
  container: AppContainer,
  adminGuard: preHandlerHookHandler
): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/api/v1/threads/overview',
    {
      preHandler: [adminGuard],
      schema: {
        response: {
          200: ThreadsOverviewSchema,
        },
      },
    },
    async () => container.threadsAutomation.getOverview()
  );

  typed.get(
    '/api/v1/threads/auth/authorize-url',
    {
      preHandler: [adminGuard],
      schema: {
        querystring: z.object({
          redirectUri: z.string().url().optional(),
          scopes: z.string().optional(),
        }),
        response: {
          200: z.object({
            authorizeUrl: z.string().url(),
            state: z.string().min(1),
            redirectUri: z.string().url(),
            scopes: z.array(z.string()),
          }),
        },
      },
    },
    async (request) => {
      const scopes = request.query.scopes
        ? request.query.scopes
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined;
      return container.threadsAutomation.getAuthorizeUrl({
        redirectUri: request.query.redirectUri,
        scopes,
      });
    }
  );

  typed.post(
    '/api/v1/threads/auth/connect',
    {
      preHandler: [adminGuard],
      schema: {
        body: z.object({
          mode: z
            .enum(['authorization_code', 'client_credentials', 'access_token'])
            .default('client_credentials'),
          code: z.string().min(1).optional(),
          redirectUri: z.string().url().optional(),
          accessToken: z.string().min(1).optional(),
        }),
        response: {
          200: z.object({
            connected: z.literal(true),
            tokenType: z.enum(['USER', 'APP']),
            profile: ThreadsAccountProfileSchema,
            expiresAt: z.string().datetime(),
          }),
        },
      },
    },
    async (request) => {
      if (request.body.mode === 'authorization_code' && !request.body.code) {
        throw new BadRequestError(
          'Parameter code wajib diisi untuk authorization_code Threads'
        );
      }
      return container.threadsAutomation.connectOAuth(request.body);
    }
  );

  typed.post(
    '/api/v1/threads/posts/:productId/draft',
    {
      preHandler: [adminGuard],
      schema: {
        params: z.object({ productId: z.string().uuid() }),
        body: z
          .object({
            mediaType: ThreadsMediaTypeSchema.default('TEXT'),
          })
          .optional(),
        response: {
          200: z.object({
            rootText: z.string(),
            replyText: z.string(),
            affiliateUrl: z.string().url(),
            mediaUrl: z.string().url().nullable(),
            resolvedMediaType: ThreadsMediaTypeSchema,
          }),
        },
      },
    },
    async (request) =>
      container.threadsAutomation.generateDraft(
        request.params.productId,
        request.body?.mediaType ?? 'TEXT'
      )
  );

  typed.post(
    '/api/v1/threads/posts/:productId/publish',
    {
      preHandler: [adminGuard],
      schema: {
        params: z.object({ productId: z.string().uuid() }),
        body: z
          .object({
            mediaType: ThreadsMediaTypeSchema.optional(),
            rootText: z.string().min(1).max(500).optional(),
            replyText: z.string().min(1).max(500).optional(),
            mediaUrl: z.string().url().optional(),
          })
          .optional(),
        response: {
          200: z.object({
            post: ThreadsPostRecordSchema,
            product: ProductSchema,
          }),
        },
      },
    },
    async (request) =>
      container.threadsAutomation.publishProductThread({
        productId: request.params.productId,
        mediaType: request.body?.mediaType,
        rootText: request.body?.rootText,
        replyText: request.body?.replyText,
        mediaUrl: request.body?.mediaUrl,
      })
  );

  typed.get(
    '/api/v1/threads/logs',
    {
      preHandler: [adminGuard],
      schema: {
        querystring: z.object({
          limit: z.coerce.number().int().positive().max(200).optional(),
          operation: ThreadsSyncOperationSchema.optional(),
          status: z.enum(['SUCCESS', 'FAILED']).optional(),
        }),
        response: {
          200: z.object({
            items: z.array(ThreadsSyncLogSchema),
          }),
        },
      },
    },
    async (request) => ({
      items: await container.threadsAutomation.listLogs(request.query),
    })
  );
}
