import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ContentAssetSchema, ContentStatusSchema } from '@ebieshop/shared';
import { z } from 'zod';
import type { AppContainer } from '../container.js';
import { BadRequestError, NotFoundError } from '../errors.js';
import type { QueueRegistry } from '../queues/registry.js';

const LOCAL_STORAGE_ROOT = resolve(process.cwd(), '.local-storage');
const MAX_UPLOAD_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_UPLOAD_VIDEO_BYTES = 40 * 1024 * 1024;
const DEFAULT_BG_FILENAMES = [
  'default-background.jpg',
  'default-background.png',
  'default-background.webp',
] as const;

const GenerateContentBodySchema = z.object({
  productId: z.string().uuid(),
  angle: z.string().min(3).max(120).default('problem-solution'),
  ttsProvider: z.enum(['edge-tts', 'elevenlabs']).default('edge-tts'),
  ttsVoiceId: z.string().min(1).default('id-ID-GadisNeural'),
});

const StoryboardBodySchema = z.object({
  productId: z.string().uuid(),
  angle: z.string().min(3).max(120).default('problem-solution'),
  ttsProvider: z.enum(['edge-tts', 'elevenlabs']).default('edge-tts'),
  ttsVoiceId: z.string().min(1).default('id-ID-GadisNeural'),
  storyboardPrompt: z.string().min(5).max(1000).optional(),
  productImageUrl: z.string().min(1).optional(),
  backgroundImageUrl: z.string().min(1).optional(),
  existingAssetId: z.string().uuid().optional(),
});

const ReferenceImageBodySchema = z.object({
  kind: z.enum(['background', 'product']),
  dataUrl: z.string().min(10),
  productId: z.string().uuid().optional(),
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

function parseImageDataUrl(
  dataUrl: string,
  maxBytes = MAX_UPLOAD_IMAGE_BYTES
): { ext: 'jpg' | 'png' | 'webp'; buffer: Buffer } {
  const match = dataUrl.match(/^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) {
    throw new BadRequestError('Format gambar harus PNG, JPEG, atau WEBP base64 data URL');
  }
  const mimeSubtype = match[1]!.toLowerCase();
  const ext = mimeSubtype === 'png' ? 'png' : mimeSubtype === 'webp' ? 'webp' : 'jpg';
  const buffer = Buffer.from(match[2]!, 'base64');
  if (buffer.byteLength === 0 || buffer.byteLength > maxBytes) {
    throw new BadRequestError(
      `Ukuran gambar harus antara 1 byte hingga ${Math.round(maxBytes / (1024 * 1024))} MB`
    );
  }
  return { ext, buffer };
}

function parseVideoDataUrl(dataUrl: string): Buffer {
  const match = dataUrl.match(
    /^data:video\/(mp4|webm|quicktime)(?:;[^,]*)?;base64,([A-Za-z0-9+/=]+)$/i
  );
  if (!match) {
    throw new BadRequestError('Format video harus MP4, WEBM, atau MOV base64 data URL');
  }
  const buffer = Buffer.from(match[2]!, 'base64');
  if (buffer.byteLength === 0 || buffer.byteLength > MAX_UPLOAD_VIDEO_BYTES) {
    throw new BadRequestError('Ukuran video maksimal 40 MB');
  }
  return buffer;
}

async function findDefaultBackgroundPreset(localStorageRoot: string): Promise<string | null> {
  for (const filename of DEFAULT_BG_FILENAMES) {
    try {
      await stat(join(localStorageRoot, 'presets', filename));
      return `/api/v1/assets/local-file/presets/${filename}`;
    } catch {
      // Check next extension
    }
  }
  return null;
}

function guessImageContentType(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

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

  typed.get(
    '/api/v1/content/reference-image',
    {
      preHandler: [adminGuard],
      schema: {
        response: {
          200: z.object({
            backgroundImageUrl: z.string().nullable(),
          }),
        },
      },
    },
    async () => ({
      backgroundImageUrl: await findDefaultBackgroundPreset(LOCAL_STORAGE_ROOT),
    })
  );

  typed.post(
    '/api/v1/content/reference-image',
    {
      preHandler: [adminGuard],
      bodyLimit: 12 * 1024 * 1024,
      schema: {
        body: ReferenceImageBodySchema,
        response: {
          200: z.object({
            imageUrl: z.string().min(1),
          }),
        },
      },
    },
    async (request) => {
      const { ext, buffer } = parseImageDataUrl(request.body.dataUrl);
      const presetsDir = join(LOCAL_STORAGE_ROOT, 'presets');
      await mkdir(presetsDir, { recursive: true });

      if (request.body.kind === 'background') {
        await Promise.all(
          DEFAULT_BG_FILENAMES.map((name) =>
            rm(join(presetsDir, name), { force: true }).catch(() => {})
          )
        );
        const fileName = `default-background.${ext}`;
        await writeFile(join(presetsDir, fileName), buffer);
        return { imageUrl: `/api/v1/assets/local-file/presets/${fileName}` };
      }

      const fileName = `product-${request.body.productId ?? 'custom'}-${Date.now()}.${ext}`;
      await writeFile(join(presetsDir, fileName), buffer);
      return { imageUrl: `/api/v1/assets/local-file/presets/${fileName}` };
    }
  );

  typed.post(
    '/api/v1/content/storyboard',
    {
      preHandler: [adminGuard],
      schema: {
        body: StoryboardBodySchema,
        response: {
          200: z.object({ asset: ContentAssetSchema }),
          201: z.object({ asset: ContentAssetSchema }),
        },
      },
    },
    async (request, reply) => {
      const product = await container.products.getProductById(request.body.productId);
      if (!product) {
        throw new NotFoundError(`Product '${request.body.productId}' not found`);
      }

      if (request.body.existingAssetId) {
        const existing = await container.contentAssets.getContentAssetById(
          request.body.existingAssetId
        );
        if (!existing) {
          throw new NotFoundError(`ContentAsset '${request.body.existingAssetId}' not found`);
        }
      }

      const baseScript = await container.scriptGenerator.generateForProduct(
        product,
        request.body.angle,
        request.body.storyboardPrompt
      );

      const resolvedProductImg =
        request.body.productImageUrl ?? product.kalodataSnapshot?.imageUrl;
      const resolvedStoryboardPrompt =
        request.body.storyboardPrompt?.trim() || baseScript.storyboardPrompt;

      const enrichedScript = {
        ...baseScript,
        ...(resolvedStoryboardPrompt
          ? { storyboardPrompt: resolvedStoryboardPrompt }
          : {}),
        ...(resolvedProductImg ? { productImageUrl: resolvedProductImg } : {}),
      };

      const asset = request.body.existingAssetId
        ? await container.contentAssets.updateContentAsset(request.body.existingAssetId, {
            scriptJson: enrichedScript,
            status: 'GENERATING_SCRIPT',
            rejectionReason: null,
          })
        : await container.contentAssets.createContentAsset({
            productId: product.id,
            llmProvider: container.llm.providerName ?? 'mock-llm',
            ttsProvider: request.body.ttsProvider,
            ttsVoiceId: request.body.ttsVoiceId,
            scriptJson: enrichedScript,
            status: 'GENERATING_SCRIPT',
          });

      return reply.status(request.body.existingAssetId ? 200 : 201).send({ asset });
    }
  );

  typed.post(
    '/api/v1/content/:id/render-video',
    {
      preHandler: [adminGuard],
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: z.object({ asset: ContentAssetSchema }),
        },
      },
    },
    async (request) => {
      const asset = await container.contentAssets.getContentAssetById(request.params.id);
      if (!asset) {
        throw new NotFoundError(`ContentAsset '${request.params.id}' not found`);
      }
      const product = await container.products.getProductById(asset.productId);
      if (!product) {
        throw new NotFoundError(`Product '${asset.productId}' not found`);
      }
      if (!asset.scriptJson.storyboardImageUrl) {
        throw new BadRequestError('Storyboard belum tersedia untuk aset ini');
      }

      const updated = await container.contentAssets.updateContentAsset(asset.id, {
        status: 'RENDERING_VIDEO',
        rejectionReason: null,
      });

      if (queueRegistry) {
        const cleanStoryboardUrl = asset.scriptJson.storyboardImageUrl.split('?')[0]!;
        const productImageUrl =
          asset.scriptJson.productImageUrl ?? product.kalodataSnapshot?.imageUrl;
        await queueRegistry.queues.LOCAL_VIDEO_RENDER.add('render', {
          contentAssetId: updated.id,
          productId: product.id,
          rawMediaDir: product.rawMediaDir,
          productName: product.name,
          ...(productImageUrl ? { productImageUrl } : {}),
          storyboardImageUrl: cleanStoryboardUrl,
          ...(product.kalodataSnapshot?.referenceVideoUrls?.length
            ? { referenceVideoUrls: product.kalodataSnapshot.referenceVideoUrls }
            : {}),
          cleanupRawMediaAfterRender: true,
          scriptJson: updated.scriptJson,
          ttsProvider: updated.ttsProvider,
          ttsVoiceId: updated.ttsVoiceId,
        });
      }

      return { asset: updated };
    }
  );

  typed.post(
    '/api/v1/content/:id/upload-video',
    {
      preHandler: [adminGuard],
      bodyLimit: 60 * 1024 * 1024,
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: z.object({
          dataUrl: z.string().min(10),
          durationSec: z.number().positive().default(18),
        }),
        response: {
          200: z.object({ asset: ContentAssetSchema }),
        },
      },
    },
    async (request) => {
      const asset = await container.contentAssets.getContentAssetById(request.params.id);
      if (!asset) {
        throw new NotFoundError(`ContentAsset '${request.params.id}' not found`);
      }

      const buffer = parseVideoDataUrl(request.body.dataUrl);
      const videoSha256 = createHash('sha256').update(buffer).digest('hex');
      const renderDir = join(LOCAL_STORAGE_ROOT, 'renders', asset.id);
      await mkdir(renderDir, { recursive: true });
      await writeFile(join(renderDir, 'final.mp4'), buffer);

      const updated = await container.contentAssets.updateContentAsset(asset.id, {
        videoR2Key: `renders/${asset.id}/final.mp4`,
        videoSha256,
        durationSec: request.body.durationSec,
        status: 'PENDING_REVIEW',
        rejectionReason: null,
      });

      await rm(join(LOCAL_STORAGE_ROOT, 'storyboards', asset.id), {
        recursive: true,
        force: true,
      }).catch(() => {});

      return { asset: updated };
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
          productName: product.name,
          ...(product.kalodataSnapshot?.imageUrl
            ? { productImageUrl: product.kalodataSnapshot.imageUrl }
            : {}),
          ...(product.kalodataSnapshot?.referenceVideoUrls?.length
            ? { referenceVideoUrls: product.kalodataSnapshot.referenceVideoUrls }
            : {}),
          cleanupRawMediaAfterRender: true,
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
      if (request.body.decision === 'REJECTED') {
        await Promise.all([
          rm(join(LOCAL_STORAGE_ROOT, 'renders', request.params.id), {
            recursive: true,
            force: true,
          }).catch(() => {}),
          rm(join(LOCAL_STORAGE_ROOT, 'storyboards', request.params.id), {
            recursive: true,
            force: true,
          }).catch(() => {}),
        ]);
      }
      return { asset };
    }
  );

  typed.delete(
    '/api/v1/content/:id',
    {
      preHandler: [adminGuard],
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: z.object({ ok: z.literal(true) }),
        },
      },
    },
    async (request) => {
      await container.contentAssets.deleteContentAsset(request.params.id);
      await Promise.all([
        rm(join(LOCAL_STORAGE_ROOT, 'renders', request.params.id), {
          recursive: true,
          force: true,
        }).catch(() => {}),
        rm(join(LOCAL_STORAGE_ROOT, 'storyboards', request.params.id), {
          recursive: true,
          force: true,
        }).catch(() => {}),
      ]);
      return { ok: true as const };
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

  typed.post(
    '/api/v1/content/:id/render-complete',
    {
      preHandler: [workerGuard],
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: z.object({
          videoR2Key: z.string().min(1),
          audioR2Key: z.string().min(1),
          subtitleR2Key: z.string().min(1),
          videoSha256: z.string().length(64),
          durationSec: z.number().positive(),
        }),
        response: {
          200: z.object({ asset: ContentAssetSchema }),
        },
      },
    },
    async (request) => {
      const asset = await container.contentAssets.updateContentAsset(
        request.params.id,
        {
          ...request.body,
          status: 'PENDING_REVIEW',
        }
      );
      await rm(join(LOCAL_STORAGE_ROOT, 'storyboards', request.params.id), {
        recursive: true,
        force: true,
      }).catch(() => {});
      return { asset };
    }
  );

  typed.post(
    '/api/v1/content/:id/render-failed',
    {
      preHandler: [workerGuard],
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: z.object({
          reason: z.string().min(1).max(500),
        }),
        response: {
          200: z.object({ asset: ContentAssetSchema }),
        },
      },
    },
    async (request) => {
      const asset = await container.contentAssets.updateContentAsset(
        request.params.id,
        {
          status: 'FAILED',
          rejectionReason: request.body.reason,
        }
      );
      return { asset };
    }
  );

  // Local dev storage endpoints (used when R2 is not configured)
  app.register(async (localScope) => {
    localScope.addContentTypeParser(
      ['video/mp4', 'audio/mpeg', 'application/x-subrip', 'application/octet-stream'],
      { parseAs: 'buffer' },
      (_req, body, done) => {
        done(null, body);
      }
    );

    localScope.put(
      '/api/v1/assets/local-upload/renders/:assetId/:fileName',
      async (request, reply) => {
        const { assetId, fileName } = request.params as {
          assetId: string;
          fileName: string;
        };
        const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
        const targetDir = join(LOCAL_STORAGE_ROOT, 'renders', assetId);
        await mkdir(targetDir, { recursive: true });
        await writeFile(join(targetDir, safeName), request.body as Buffer);
        return reply.status(200).send({ ok: true });
      }
    );

    localScope.get(
      '/api/v1/assets/local-file/renders/:assetId/:fileName',
      async (request, reply) => {
        const { assetId, fileName } = request.params as {
          assetId: string;
          fileName: string;
        };
        const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
        const filePath = join(LOCAL_STORAGE_ROOT, 'renders', assetId, safeName);
        try {
          const info = await stat(filePath);
          const contentType = safeName.endsWith('.mp4')
            ? 'video/mp4'
            : safeName.endsWith('.mp3')
              ? 'audio/mpeg'
              : 'text/plain; charset=utf-8';
          return reply
            .header('Content-Type', contentType)
            .header('Content-Length', info.size)
            .send(createReadStream(filePath));
        } catch {
          if (container.env.R2_PUBLIC_BASE_URL) {
            const targetUrl = `${container.env.R2_PUBLIC_BASE_URL.replace(/\/$/, '')}/renders/${assetId}/${safeName}`;
            return reply.redirect(targetUrl);
          }
          return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'File not found' } });
        }
      }
    );

    localScope.get(
      '/api/v1/assets/local-file/presets/:fileName',
      async (request, reply) => {
        const { fileName } = request.params as { fileName: string };
        const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
        const filePath = join(LOCAL_STORAGE_ROOT, 'presets', safeName);
        try {
          const info = await stat(filePath);
          return reply
            .header('Content-Type', guessImageContentType(safeName))
            .header('Content-Length', info.size)
            .send(createReadStream(filePath));
        } catch {
          return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Preset not found' } });
        }
      }
    );

    localScope.get(
      '/api/v1/assets/local-file/storyboards/:assetId/:fileName',
      async (request, reply) => {
        const { assetId, fileName } = request.params as {
          assetId: string;
          fileName: string;
        };
        const safeAssetId = assetId.replace(/[^a-zA-Z0-9-]/g, '_');
        const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
        const filePath = join(LOCAL_STORAGE_ROOT, 'storyboards', safeAssetId, safeName);
        try {
          const info = await stat(filePath);
          return reply
            .header('Content-Type', guessImageContentType(safeName))
            .header('Content-Length', info.size)
            .send(createReadStream(filePath));
        } catch {
          return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Storyboard not found' } });
        }
      }
    );
  });
}
