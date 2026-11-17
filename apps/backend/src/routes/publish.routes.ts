import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  PublishJobRecordSchema,
  TargetPlatformSchema,
  type ExecutionMode,
  type TargetPlatform,
} from '@ebieshop/shared';
import { z } from 'zod';
import type { AppContainer } from '../container.js';
import { BadRequestError, NotFoundError } from '../errors.js';
import type { QueueRegistry } from '../queues/registry.js';

const SchedulePublishBodySchema = z.object({
  contentAssetId: z.string().uuid(),
  platforms: z.array(TargetPlatformSchema).min(1),
  baseScheduledAt: z.string().datetime().optional(),
  visibility: z.enum(['PUBLIC', 'PRIVATE']).default('PUBLIC'),
});

function resolveExecutionMode(platform: TargetPlatform): ExecutionMode {
  return platform === 'SHOPEE_VIDEO' || platform === 'TIKTOK_STUDIO'
    ? 'PLAYWRIGHT_LOCAL'
    : 'OFFICIAL_API';
}

export function registerPublishRoutes(
  app: FastifyInstance,
  container: AppContainer,
  adminGuard: preHandlerHookHandler,
  queueRegistry?: QueueRegistry
): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/api/v1/publish-jobs',
    {
      preHandler: [adminGuard],
      schema: {
        response: {
          200: z.object({
            items: z.array(PublishJobRecordSchema),
          }),
        },
      },
    },
    async () => {
      const items = await container.publishJobs.listPublishJobs();
      return { items };
    }
  );

  typed.post(
    '/api/v1/publish-jobs/schedule',
    {
      preHandler: [adminGuard],
      schema: {
        body: SchedulePublishBodySchema,
        response: {
          201: z.object({
            jobs: z.array(PublishJobRecordSchema),
          }),
        },
      },
    },
    async (request, reply) => {
      const asset = await container.contentAssets.getContentAssetById(
        request.body.contentAssetId
      );
      if (!asset) {
        throw new NotFoundError(
          `ContentAsset '${request.body.contentAssetId}' not found`
        );
      }
      if (asset.status !== 'APPROVED') {
        throw new BadRequestError(
          `ContentAsset must be APPROVED before scheduling (current: ${asset.status})`
        );
      }

      const product = await container.products.getProductById(asset.productId);
      if (!product) {
        throw new NotFoundError(`Product '${asset.productId}' not found`);
      }

      const baseMs = request.body.baseScheduledAt
        ? Date.parse(request.body.baseScheduledAt)
        : Date.now();
      const createdJobs = [];

      for (let idx = 0; idx < request.body.platforms.length; idx += 1) {
        const platform = request.body.platforms[idx]!;
        const executionMode = resolveExecutionMode(platform);
        // Stagger cross-posting by 12 minutes per platform to avoid burst automation
        const staggerMs = idx * 12 * 60_000;
        const scheduledAt = new Date(baseMs + staggerMs).toISOString();

        const job = await container.publishJobs.createPublishJob({
          contentAssetId: asset.id,
          productId: product.id,
          platform,
          executionMode,
          visibility: request.body.visibility,
          scheduledAt,
        });

        if (queueRegistry) {
          const payload = {
            publishJobId: job.id,
            contentAssetId: asset.id,
            productId: product.id,
            platform,
            executionMode,
            visibility: job.visibility,
            videoR2Key: asset.videoR2Key ?? `renders/${asset.id}/final.mp4`,
            captionSeo: asset.scriptJson.captionSeo,
            pinnedComment: asset.scriptJson.pinnedComment,
            productName: product.name,
            tiktokProductId: product.affiliateUrls.tiktokProductId,
          };

          const targetQueue =
            executionMode === 'OFFICIAL_API'
              ? queueRegistry.queues.OFFICIAL_API_PUBLISH
              : queueRegistry.queues.LOCAL_PLAYWRIGHT_PUBLISH;

          await targetQueue.add('publish', payload, {
            delay: Math.max(0, Date.parse(scheduledAt) - Date.now()),
          });
        }

        createdJobs.push(job);
      }

      return reply.status(201).send({ jobs: createdJobs });
    }
  );
}
