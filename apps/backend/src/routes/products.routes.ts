import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  AffiliateUrlsSchema,
  KalodataCandidateSchema,
  ProductSchema,
  ProductStatusSchema,
  type KalodataCandidate,
  type KalodataSnapshot,
  type Product,
} from '@ebieshop/shared';
import { z } from 'zod';
import { buildSeoGeoTriggerKeyword } from '../adapters/llm-providers.js';
import type { AppContainer } from '../container.js';
import { BadRequestError, NotFoundError } from '../errors.js';

const CreateProductBodySchema = z.object({
  kalodataProductId: z.string().min(1).nullable().optional(),
  niche: z.string().min(2).max(100),
  name: z.string().min(3).max(255),
  priceIdr: z.number().int().positive().max(1_000_000_000),
  rating: z.number().min(0).max(5),
  commissionRatePct: z.number().min(0).max(100),
  isCommissionXtra: z.boolean(),
  isOfficialStore: z.boolean(),
  biolinkNumber: z.string().min(1).max(16),
  triggerKeyword: z.string().regex(/^[A-Z0-9]{3,16}$/),
  affiliateUrls: AffiliateUrlsSchema,
  rawMediaDir: z.string().min(1),
  rawMediaClipCount: z.number().int().nonnegative().default(0),
});

const UpdateProductBodySchema = z.object({
  name: z.string().min(3).max(255).optional(),
  priceIdr: z.number().int().positive().max(1_000_000_000).optional(),
  rating: z.number().min(0).max(5).optional(),
  commissionRatePct: z.number().min(0).max(100).optional(),
  isCommissionXtra: z.boolean().optional(),
  isOfficialStore: z.boolean().optional(),
  biolinkNumber: z.string().min(1).max(16).optional(),
  triggerKeyword: z.string().regex(/^[A-Z0-9]{3,16}$/).optional(),
  affiliateUrls: AffiliateUrlsSchema.optional(),
  rawMediaDir: z.string().min(1).optional(),
  rawMediaClipCount: z.number().int().nonnegative().optional(),
  status: ProductStatusSchema.optional(),
});

const KalodataSyncBodySchema = z.object({
  niche: z.string().min(2).max(100),
  maxPriceIdr: z.number().int().positive().max(1_000_000_000).default(1_000_000_000),
  minRating: z.number().min(0).max(5).default(4.8),
  limit: z.number().int().positive().max(50).default(15),
  previewOnly: z.boolean().default(false),
});

const KalodataSaveBodySchema = z.object({
  niche: z.string().min(2).max(100).optional(),
  candidates: z.array(KalodataCandidateSchema).min(1).max(50),
});

function buildSnapshotFromCandidate(candidate: KalodataCandidate): KalodataSnapshot {
  return {
    ...(candidate.imageUrl ? { imageUrl: candidate.imageUrl } : {}),
    weeklyRevenueIdr: candidate.weeklyRevenueIdr,
    weeklyUnitsSold: candidate.weeklyUnitsSold,
    referenceVideoUrls: candidate.referenceVideoUrls,
    referenceVideos: candidate.referenceVideos,
    ...(candidate.unitPriceExactIdr !== undefined
      ? { unitPriceExactIdr: candidate.unitPriceExactIdr }
      : {}),
    ...(candidate.revenueExactIdr !== undefined
      ? { revenueExactIdr: candidate.revenueExactIdr }
      : {}),
    ...(candidate.revenueGrowthRatePct !== undefined
      ? { revenueGrowthRatePct: candidate.revenueGrowthRatePct }
      : {}),
    ...(candidate.liveRevenueIdr !== undefined
      ? { liveRevenueIdr: candidate.liveRevenueIdr }
      : {}),
    ...(candidate.videoRevenueIdr !== undefined
      ? { videoRevenueIdr: candidate.videoRevenueIdr }
      : {}),
    ...(candidate.showcaseRevenueIdr !== undefined
      ? { showcaseRevenueIdr: candidate.showcaseRevenueIdr }
      : {}),
    ...(candidate.launchDate !== undefined
      ? { launchDate: candidate.launchDate }
      : {}),
    ...(candidate.sellerId !== undefined
      ? { sellerId: candidate.sellerId }
      : {}),
    ...(candidate.sellerName !== undefined
      ? { sellerName: candidate.sellerName }
      : {}),
    ...(candidate.skuCount !== undefined
      ? { skuCount: candidate.skuCount }
      : {}),
    ...(candidate.priCategory !== undefined
      ? { priCategory: candidate.priCategory }
      : {}),
    ...(candidate.secCategory !== undefined
      ? { secCategory: candidate.secCategory }
      : {}),
    ...(candidate.terCategory !== undefined
      ? { terCategory: candidate.terCategory }
      : {}),
    syncedAt: new Date().toISOString(),
  };
}

async function saveCandidatesToRepository(
  container: AppContainer,
  candidates: KalodataCandidate[],
  overrideNiche?: string
): Promise<{ savedCount: number; items: Product[] }> {
  const existingProducts = await container.products.listProducts();
  const usedBiolinkNumbers = new Set(existingProducts.map((p) => p.biolinkNumber));
  const usedKeywords = new Set(
    existingProducts.map((p) => p.triggerKeyword.toUpperCase())
  );
  let seedCounter = existingProducts.length + 1;
  let savedCount = 0;
  const savedItems: Product[] = [];

  for (const candidate of candidates) {
    const snapshot = buildSnapshotFromCandidate(candidate);
    const alreadyExists = await container.products.findByKalodataId(
      candidate.kalodataProductId
    );
    if (alreadyExists) {
      const updated = await container.products.updateProduct(alreadyExists.id, {
        name: candidate.name,
        priceIdr: candidate.priceIdr,
        rating: candidate.rating,
        commissionRatePct: candidate.commissionRatePct,
        isCommissionXtra: candidate.isCommissionXtra,
        isOfficialStore: candidate.isOfficialStore,
        kalodataSnapshot: snapshot,
      });
      savedItems.push(updated);
      continue;
    }

    let slotNum = `C-${String(seedCounter).padStart(3, '0')}`;
    let keyword = generateUniqueSlotCode('KD', seedCounter);
    while (usedBiolinkNumbers.has(slotNum) || usedKeywords.has(keyword)) {
      seedCounter += 1;
      slotNum = `C-${String(seedCounter).padStart(3, '0')}`;
      keyword = generateUniqueSlotCode('KD', seedCounter);
    }
    usedBiolinkNumbers.add(slotNum);
    usedKeywords.add(keyword);
    seedCounter += 1;

    const created = await container.products.createProduct({
      kalodataProductId: candidate.kalodataProductId,
      niche: overrideNiche ?? candidate.niche,
      name: candidate.name,
      priceIdr: candidate.priceIdr,
      rating: candidate.rating,
      commissionRatePct: candidate.commissionRatePct,
      isCommissionXtra: candidate.isCommissionXtra,
      isOfficialStore: candidate.isOfficialStore,
      biolinkNumber: slotNum,
      triggerKeyword: keyword,
      affiliateUrls: {
        tiktokProductId: candidate.kalodataProductId,
      },
      kalodataSnapshot: snapshot,
      rawMediaDir: `raw_media_dir/${candidate.kalodataProductId}`,
      rawMediaClipCount: 0,
      status: 'CANDIDATE',
    });
    savedItems.push(created);
    savedCount += 1;
  }

  return { savedCount, items: savedItems };
}

function generateUniqueSlotCode(prefix: string, seedIndex: number): string {
  const num = String(100 + seedIndex).padStart(3, '0');
  return `${prefix}${num}`;
}

function computeNextBiolinkNumber(allProducts: Product[], excludeId: string): string {
  let maxSeq = 0;
  for (const p of allProducts) {
    if (p.id === excludeId || p.status === 'CANDIDATE') {
      continue;
    }
    if (/^\d{1,4}$/.test(p.biolinkNumber)) {
      const parsed = Number.parseInt(p.biolinkNumber, 10);
      if (Number.isFinite(parsed) && parsed > maxSeq) {
        maxSeq = parsed;
      }
    }
  }
  return String(maxSeq + 1).padStart(3, '0');
}

function resolveAffiliateTargetUrl(affiliateUrls: Product['affiliateUrls']): string | undefined {
  return (
    affiliateUrls.shopeeShortlink ??
    affiliateUrls.tiktokShortlink ??
    affiliateUrls.tokopediaShortlink ??
    affiliateUrls.biolinkAnchorUrl
  );
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
      const existing = await container.products.getProductById(request.params.id);
      if (!existing) {
        throw new NotFoundError(`Product '${request.params.id}' not found`);
      }

      const nextStatus = request.body.status ?? existing.status;
      const isCuratedOrActive = nextStatus === 'CURATED' || nextStatus === 'ACTIVE';
      const hasAssignedSeq =
        existing.status !== 'CANDIDATE' && /^\d{3,4}$/.test(existing.biolinkNumber);
      const isPlaceholderKeyword = /^(KD\d+|CANDIDATE[A-Z0-9_]*)$/i.test(
        existing.triggerKeyword
      );

      const needAllProducts =
        isCuratedOrActive &&
        ((!request.body.biolinkNumber && !hasAssignedSeq) ||
          (!request.body.triggerKeyword && isPlaceholderKeyword));
      const allProducts = needAllProducts
        ? await container.products.listProducts()
        : undefined;

      let assignedBiolinkNumber = request.body.biolinkNumber;
      if (isCuratedOrActive && !assignedBiolinkNumber && !hasAssignedSeq && allProducts) {
        assignedBiolinkNumber = computeNextBiolinkNumber(allProducts, existing.id);

        // Free any legacy CANDIDATE placeholder holding this sequential number
        const legacyHolder = allProducts.find(
          (p) =>
            p.id !== existing.id &&
            p.status === 'CANDIDATE' &&
            p.biolinkNumber === assignedBiolinkNumber
        );
        if (legacyHolder) {
          await container.products.updateProduct(legacyHolder.id, {
            biolinkNumber: `C-${legacyHolder.id.slice(0, 8)}`,
          });
        }
      }

      const finalBiolinkNumber = assignedBiolinkNumber ?? existing.biolinkNumber;

      let assignedTriggerKeyword = request.body.triggerKeyword;
      if (
        isCuratedOrActive &&
        !assignedTriggerKeyword &&
        isPlaceholderKeyword &&
        allProducts
      ) {
        const usedKeywords = new Set(
          allProducts
            .filter((p) => p.id !== existing.id)
            .map((p) => p.triggerKeyword.toUpperCase())
        );
        let generated: string | null = null;
        if (container.llm.generateTriggerKeyword) {
          try {
            generated = await container.llm.generateTriggerKeyword({
              product: existing,
              biolinkNumber: finalBiolinkNumber,
              usedKeywords: Array.from(usedKeywords),
            });
          } catch {
            generated = null;
          }
        }
        const cleaned = generated
          ?.toUpperCase()
          .replace(/[^A-Z0-9]/g, '')
          .slice(0, 16);
        assignedTriggerKeyword =
          cleaned &&
          /^[A-Z0-9]{3,16}$/.test(cleaned) &&
          !/^(KD\d+|CANDIDATE)/.test(cleaned) &&
          !usedKeywords.has(cleaned)
            ? cleaned
            : buildSeoGeoTriggerKeyword(existing, finalBiolinkNumber, usedKeywords);
      }

      const mergedAffiliateUrls = {
        ...existing.affiliateUrls,
        ...(request.body.affiliateUrls ?? {}),
      };

      const targetUrl = resolveAffiliateTargetUrl(mergedAffiliateUrls);
      const shouldSyncLnkBio =
        isCuratedOrActive &&
        Boolean(targetUrl) &&
        (!mergedAffiliateUrls.lnkBioId ||
          request.body.name !== undefined ||
          request.body.biolinkNumber !== undefined ||
          request.body.affiliateUrls !== undefined ||
          request.body.status !== undefined);

      const updatedProduct = await container.products.updateProduct(request.params.id, {
        ...request.body,
        ...(assignedBiolinkNumber ? { biolinkNumber: assignedBiolinkNumber } : {}),
        ...(assignedTriggerKeyword ? { triggerKeyword: assignedTriggerKeyword } : {}),
        affiliateUrls: mergedAffiliateUrls,
      });

      if (shouldSyncLnkBio) {
        const synced = await container.lnkBioAutomation.publishOrUpdateProductLink({
          product: updatedProduct,
        });
        return { product: synced.product };
      }

      return { product: updatedProduct };
    }
  );

  typed.post(
    '/api/v1/products/:id/lnkbio-sync',
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
      const existing = await container.products.getProductById(request.params.id);
      if (!existing) {
        throw new NotFoundError(`Product '${request.params.id}' not found`);
      }
      const targetUrl = resolveAffiliateTargetUrl(existing.affiliateUrls);
      if (!targetUrl) {
        throw new BadRequestError(
          'Isi Shopee/TikTok/Tokopedia Shortlink terlebih dahulu sebelum posting ke Lnk.Bio'
        );
      }

      let biolinkNumber = existing.biolinkNumber;
      let currentProduct = existing;
      if (!/^\d{3,4}$/.test(biolinkNumber)) {
        const allProducts = await container.products.listProducts();
        biolinkNumber = computeNextBiolinkNumber(allProducts, existing.id);
        currentProduct = await container.products.updateProduct(existing.id, {
          biolinkNumber,
        });
      }

      const synced = await container.lnkBioAutomation.publishOrUpdateProductLink({
        product: currentProduct,
      });
      return { product: synced.product };
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
      if (request.body.previewOnly) {
        return { syncedCount: 0, candidates };
      }
      const { savedCount } = await saveCandidatesToRepository(
        container,
        candidates,
        request.body.niche
      );
      return { syncedCount: savedCount, candidates };
    }
  );

  typed.post(
    '/api/v1/products/kalodata-save',
    {
      preHandler: [adminGuard],
      schema: {
        body: KalodataSaveBodySchema,
        response: {
          200: z.object({
            savedCount: z.number().int().nonnegative(),
            items: z.array(ProductSchema),
          }),
        },
      },
    },
    async (request) => {
      return saveCandidatesToRepository(
        container,
        request.body.candidates,
        request.body.niche
      );
    }
  );

  typed.delete(
    '/api/v1/products/:id',
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
      await container.products.deleteProduct(request.params.id);
      return { ok: true as const };
    }
  );
}
