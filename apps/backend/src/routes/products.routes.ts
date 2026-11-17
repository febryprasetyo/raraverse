import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  AffiliateUrlsSchema,
  KalodataCandidateSchema,
  ProductSchema,
  ProductStatusSchema,
} from '@ebieshop/shared';
import { z } from 'zod';
import type { AppContainer } from '../container.js';
import { NotFoundError } from '../errors.js';

const CreateProductBodySchema = z.object({
  kalodataProductId: z.string().min(1).nullable().optional(),
  niche: z.string().min(2).max(100),
  name: z.string().min(3).max(255),
  priceIdr: z.number().int().positive().max(99999),
  rating: z.number().min(0).max(5),
  commissionRatePct: z.number().min(0).max(100),
  isCommissionXtra: z.boolean(),
  isOfficialStore: z.boolean(),
  biolinkNumber: z.string().regex(/^\d{3,4}$/),
  triggerKeyword: z.string().regex(/^[A-Z0-9]{3,16}$/),
  affiliateUrls: AffiliateUrlsSchema,
  rawMediaDir: z.string().min(1),
  rawMediaClipCount: z.number().int().nonnegative().default(0),
});

const UpdateProductBodySchema = z.object({
  name: z.string().min(3).max(255).optional(),
  priceIdr: z.number().int().positive().max(99999).optional(),
  rating: z.number().min(0).max(5).optional(),
  commissionRatePct: z.number().min(0).max(100).optional(),
  isCommissionXtra: z.boolean().optional(),
  isOfficialStore: z.boolean().optional(),
  biolinkNumber: z.string().regex(/^\d{3,4}$/).optional(),
  triggerKeyword: z.string().regex(/^[A-Z0-9]{3,16}$/).optional(),
  affiliateUrls: AffiliateUrlsSchema.optional(),
  rawMediaDir: z.string().min(1).optional(),
  rawMediaClipCount: z.number().int().nonnegative().optional(),
  status: ProductStatusSchema.optional(),
});

const KalodataSyncBodySchema = z.object({
  niche: z.string().min(2).max(100),
  maxPriceIdr: z.number().int().positive().max(99999).default(99999),
  minRating: z.number().min(0).max(5).default(4.8),
  limit: z.number().int().positive().max(50).default(10),
});

function generateUniqueSlotCode(prefix: string, seedIndex: number): string {
  const num = String(100 + seedIndex).padStart(3, '0');
  return `${prefix}${num}`;
}

export function registerProductRoutes(
  app: FastifyInstance,
  container: AppContainer,
  adminGuard: preHandlerHookHandler
): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/api/v1/products',
    {
      preHandler: [adminGuard],
      schema: {
        querystring: z.object({
          status: ProductStatusSchema.optional(),
        }),
        response: {
          200: z.object({
            items: z.array(ProductSchema),
          }),
        },
      },
    },
    async (request) => {
      const items = await container.products.listProducts(
        request.query.status ? { status: request.query.status } : undefined
      );
      return { items };
    }
  );

  typed.get(
    '/api/v1/products/:id',
    {
      preHandler: [adminGuard],
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: z.object({ product: ProductSchema }),
        },
      },
    },
    async (request) => {
      const product = await container.products.getProductById(request.params.id);
      if (!product) {
        throw new NotFoundError(`Product '${request.params.id}' not found`);
      }
      return { product };
    }
  );

  typed.post(
    '/api/v1/products',
    {
      preHandler: [adminGuard],
      schema: {
        body: CreateProductBodySchema,
        response: {
          201: z.object({ product: ProductSchema }),
        },
      },
    },
    async (request, reply) => {
      const product = await container.products.createProduct({
        ...request.body,
        status: 'CANDIDATE',
      });
      return reply.status(201).send({ product });
    }
  );

  typed.patch(
    '/api/v1/products/:id',
    {
      preHandler: [adminGuard],
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: UpdateProductBodySchema,
        response: {
          200: z.object({ product: ProductSchema }),
        },
      },
    },
    async (request) => {
      const product = await container.products.updateProduct(
        request.params.id,
        request.body
      );
      return { product };
    }
  );

  typed.post(
    '/api/v1/products/kalodata-sync',
    {
      preHandler: [adminGuard],
      schema: {
        body: KalodataSyncBodySchema,
        response: {
          200: z.object({
            syncedCount: z.number().int().nonnegative(),
            candidates: z.array(KalodataCandidateSchema),
          }),
        },
      },
    },
    async (request) => {
      const candidates = await container.kalodata.fetchWinningCandidates(request.body);
      const existingProducts = await container.products.listProducts();
      let seedCounter = existingProducts.length + 1;
      let syncedCount = 0;

      for (const candidate of candidates) {
        const alreadyExists = await container.products.findByKalodataId(
          candidate.kalodataProductId
        );
        if (alreadyExists) {
          continue;
        }

        const slotNum = String(seedCounter).padStart(3, '0');
        const keyword = generateUniqueSlotCode('KD', seedCounter);
        seedCounter += 1;

        await container.products.createProduct({
          kalodataProductId: candidate.kalodataProductId,
          niche: candidate.niche,
          name: candidate.name,
          priceIdr: candidate.priceIdr,
          rating: candidate.rating,
          commissionRatePct: candidate.commissionRatePct,
          isCommissionXtra: candidate.isCommissionXtra,
          isOfficialStore: candidate.isOfficialStore,
          biolinkNumber: slotNum,
          triggerKeyword: keyword,
          affiliateUrls: {},
          kalodataSnapshot: {
            weeklyRevenueIdr: candidate.weeklyRevenueIdr,
            weeklyUnitsSold: candidate.weeklyUnitsSold,
            referenceVideoUrls: candidate.referenceVideoUrls,
            syncedAt: new Date().toISOString(),
          },
          rawMediaDir: `raw_media_dir/${candidate.kalodataProductId}`,
          rawMediaClipCount: 0,
          status: 'CANDIDATE',
        });
        syncedCount += 1;
      }

      return { syncedCount, candidates };
    }
  );
}
