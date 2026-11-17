import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ContentAssetSchema, ContentStatusSchema } from '@ebieshop/shared';
import { z } from 'zod';
import type { AppContainer } from '../container.js';
import { NotFoundError } from '../errors.js';
import type { QueueRegistry } from '../queues/registry.js';

const GenerateContentBodySchema = z.object({
  productId: z.string().uuid(),
  angle: z.string().min(3).max(120).default('problem-solution'),
  ttsProvider: z.enum(['edge-tts', 'elevenlabs']).default('edge-tts'),
  ttsVoiceId: z.string().min(1).default('id-ID-GadisNeural'),
});

const ReviewContentBodySchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  rejectionReason: z.string().max(500).optional(),
});

const UploadUrlBodySchema = z.object({
  assetId: z.string().uuid(),
  fileName: z.string().min(1).max(128),
  contentType: z.string().min(3).max(128),
  expiresInSec: z.number().int().positive().max(3600).default(900),
});

export function registerContentRoutes(
  app: FastifyInstance,
  container: AppContainer,
  adminGuard: preHandlerHookHandler,
  workerGuard: preHandlerHookHandler,
  queueRegistry?: QueueRegistry
): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/api/v1/content',
    {
      preHandler: [adminGuard],
      schema: {
        querystring: z.object({
          status: ContentStatusSchema.optional(),
        }),
        response: {
          200: z.object({
            items: z.array(ContentAssetSchema),
          }),
        },
      },
    },
    async (request) => {
      const items = await container.contentAssets.listContentAssets(
        request.query.status ? { status: request.query.status } : undefined
      );
      return { items };
    }
  );

  typed.post(
    '/api/v1/content/generate',
    {
      preHandler: [adminGuard],
      schema: {
        body: GenerateContentBodySchema,
        response: {
          201: z.object({
            asset: ContentAssetSchema,
          }),
        },
      },
    },
    async (request, reply) => {
      const product = await container.products.getProductById(request.body.productId);
      if (!product) {
        throw new NotFoundError(`Product '${request.body.productId}' not found`);
      }

      const scriptJson = await container.scriptGenerator.generateForProduct(
        product,
        request.body.angle
      );

      const asset = await container.contentAssets.createContentAsset({
        productId: product.id,
        llmProvider: container.llm.providerName ?? 'mock-llm',
        ttsProvider: request.body.ttsProvider,
        ttsVoiceId: request.body.ttsVoiceId,
        scriptJson,
        status: 'RENDERING_VIDEO',
      });

      if (queueRegistry) {
        await queueRegistry.queues.LOCAL_VIDEO_RENDER.add('render', {
          contentAssetId: asset.id,
          productId: product.id,
          rawMediaDir: product.rawMediaDir,
          scriptJson,
          ttsProvider: asset.ttsProvider,
          ttsVoiceId: asset.ttsVoiceId,
        });
      }

      return reply.status(201).send({ asset });
    }
  );

  typed.patch(
    '/api/v1/content/:id/review',
    {
      preHandler: [adminGuard],
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: ReviewContentBodySchema,
        response: {
          200: z.object({
            asset: ContentAssetSchema,
          }),
        },
      },
    },
    async (request) => {
      const asset = await container.contentAssets.updateContentAsset(request.params.id, {
        status: request.body.decision,
        rejectionReason:
          request.body.decision === 'REJECTED'
            ? request.body.rejectionReason ?? 'Rejected by operator'
            : null,
      });
      return { asset };
    }
  );

  typed.post(
    '/api/v1/assets/upload-url',
    {
      preHandler: [workerGuard],
      schema: {
        body: UploadUrlBodySchema,
        response: {
          200: z.object({
            uploadUrl: z.string().url(),
            r2Key: z.string(),
            publicUrl: z.string().url(),
            expiresInSec: z.number().int().positive(),
          }),
        },
      },
    },
    async (request) => {
      const safeFileName = request.body.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
      return container.storage.createPutUrl({
        key: `renders/${request.body.assetId}/${safeFileName}`,
        contentType: request.body.contentType,
        expiresInSec: request.body.expiresInSec,
      });
    }
  );
}
