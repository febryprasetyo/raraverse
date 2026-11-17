import { randomUUID } from 'node:crypto';
import {
  loadMockContentAssets,
  loadMockDmLogs,
  loadMockKalodataCandidates,
  loadMockProducts,
  loadMockScriptGeneratorOutput,
  loadMockWeeklyEvaluation,
} from '@ebieshop/mocks';
import type { ContentAsset, ContentStatus, DmLog, Product, ProductStatus } from '@ebieshop/shared';
import { ConflictError, NotFoundError } from '../errors.js';
import { assertValidProductTransition } from '../services/product-transitions.js';
import type {
  CreateContentAssetInput,
  CreateDmLogInput,
  CreateProductInput,
  IAnalyticsRepository,
  IContentAssetRepository,
  IDmLogRepository,
  IKalodataClient,
  ILlmProvider,
  IProductRepository,
  KalodataFilterInput,
  UpdateContentAssetInput,
  UpdateProductInput,
} from './contracts.js';

export class MockKalodataClient implements IKalodataClient {
  async fetchWinningCandidates(filter: KalodataFilterInput) {
    return loadMockKalodataCandidates()
      .filter(
        (item) =>
          item.niche === filter.niche &&
          item.priceIdr <= filter.maxPriceIdr &&
          item.rating >= filter.minRating
      )
      .slice(0, filter.limit);
  }
}

export class MockLlmProvider implements ILlmProvider {
  readonly providerName = 'mock-llm';

  async generateScript() {
    return loadMockScriptGeneratorOutput();
  }
}

export class MockProductRepository implements IProductRepository {
  private readonly items: Product[];

  constructor() {
    this.items = loadMockProducts().map((item) => structuredClone(item));
  }

  async listProducts(filter?: { status?: ProductStatus }): Promise<Product[]> {
    if (!filter?.status) {
      return [...this.items];
    }
    return this.items.filter((item) => item.status === filter.status);
  }

  async getProductById(id: string): Promise<Product | null> {
    return this.items.find((item) => item.id === id) ?? null;
  }

  async findByTriggerKeyword(keyword: string): Promise<Product | null> {
    const normalized = keyword.trim().toUpperCase();
    return this.items.find((item) => item.triggerKeyword.toUpperCase() === normalized) ?? null;
  }

  async findByKalodataId(kalodataProductId: string): Promise<Product | null> {
    return this.items.find((item) => item.kalodataProductId === kalodataProductId) ?? null;
  }

  async createProduct(input: CreateProductInput): Promise<Product> {
    const normalizedKeyword = input.triggerKeyword.toUpperCase();
    if (this.items.some((p) => p.triggerKeyword.toUpperCase() === normalizedKeyword)) {
      throw new ConflictError(`Trigger keyword '${normalizedKeyword}' is already in use`);
    }
    if (this.items.some((p) => p.biolinkNumber === input.biolinkNumber)) {
      throw new ConflictError(`Biolink number '${input.biolinkNumber}' is already in use`);
    }
    if (
      input.kalodataProductId &&
      this.items.some((p) => p.kalodataProductId === input.kalodataProductId)
    ) {
      throw new ConflictError(
        `Kalodata product '${input.kalodataProductId}' already exists`
      );
    }

    const now = new Date().toISOString();
    const product: Product = {
      id: randomUUID(),
      kalodataProductId: input.kalodataProductId ?? null,
      niche: input.niche,
      name: input.name,
      priceIdr: input.priceIdr,
      rating: input.rating,
      commissionRatePct: input.commissionRatePct,
      isCommissionXtra: input.isCommissionXtra,
      isOfficialStore: input.isOfficialStore,
      biolinkNumber: input.biolinkNumber,
      triggerKeyword: normalizedKeyword,
      affiliateUrls: input.affiliateUrls,
      kalodataSnapshot: input.kalodataSnapshot ?? null,
      rawMediaDir: input.rawMediaDir,
      rawMediaClipCount: input.rawMediaClipCount,
      status: input.status ?? 'CANDIDATE',
      createdAt: now,
      updatedAt: now,
    };

    this.items.push(product);
    return product;
  }

  async updateProduct(id: string, patch: UpdateProductInput): Promise<Product> {
    const index = this.items.findIndex((p) => p.id === id);
    if (index === -1) {
      throw new NotFoundError(`Product '${id}' not found`);
    }
    const existing = this.items[index]!;

    if (patch.status) {
      assertValidProductTransition(existing.status, patch.status);
    }

    const nextKeyword = patch.triggerKeyword
      ? patch.triggerKeyword.toUpperCase()
      : existing.triggerKeyword;
    if (
      patch.triggerKeyword &&
      this.items.some(
        (p) => p.id !== id && p.triggerKeyword.toUpperCase() === nextKeyword
      )
    ) {
      throw new ConflictError(`Trigger keyword '${nextKeyword}' is already in use`);
    }

    if (
      patch.biolinkNumber &&
      this.items.some((p) => p.id !== id && p.biolinkNumber === patch.biolinkNumber)
    ) {
      throw new ConflictError(`Biolink number '${patch.biolinkNumber}' is already in use`);
    }

    const updated: Product = {
      ...existing,
      ...patch,
      triggerKeyword: nextKeyword,
      updatedAt: new Date().toISOString(),
    };
    this.items[index] = updated;
    return updated;
  }
}

export class MockContentAssetRepository implements IContentAssetRepository {
  private readonly items: ContentAsset[];

  constructor() {
    this.items = loadMockContentAssets().map((item) => structuredClone(item));
  }

  async listContentAssets(filter?: { status?: ContentStatus }): Promise<ContentAsset[]> {
    if (!filter?.status) {
      return [...this.items];
    }
    return this.items.filter((item) => item.status === filter.status);
  }

  async getContentAssetById(id: string): Promise<ContentAsset | null> {
    return this.items.find((item) => item.id === id) ?? null;
  }

  async createContentAsset(input: CreateContentAssetInput): Promise<ContentAsset> {
    const asset: ContentAsset = {
      id: randomUUID(),
      productId: input.productId,
      llmProvider: input.llmProvider,
      ttsProvider: input.ttsProvider,
      ttsVoiceId: input.ttsVoiceId,
      scriptJson: input.scriptJson,
      audioR2Key: null,
      subtitleR2Key: null,
      videoR2Key: null,
      videoSha256: null,
      durationSec: null,
      resolution: '1080x1920',
      status: input.status ?? 'RENDERING_VIDEO',
      rejectionReason: null,
    };
    this.items.push(asset);
    return asset;
  }

  async updateContentAsset(
    id: string,
    patch: UpdateContentAssetInput
  ): Promise<ContentAsset> {
    const idx = this.items.findIndex((item) => item.id === id);
    if (idx === -1) {
      throw new NotFoundError(`ContentAsset '${id}' not found`);
    }
    const updated: ContentAsset = {
      ...this.items[idx]!,
      ...patch,
    };
    this.items[idx] = updated;
    return updated;
  }
}

export class MockDmLogRepository implements IDmLogRepository {
  private readonly items: DmLog[];

  constructor() {
    this.items = loadMockDmLogs().map((item) => structuredClone(item));
  }

  async listDmLogs(): Promise<DmLog[]> {
    return [...this.items];
  }

  async findByCommentId(commentId: string): Promise<DmLog | null> {
    return this.items.find((item) => item.commentId === commentId) ?? null;
  }

  async createDmLog(input: CreateDmLogInput): Promise<DmLog> {
    if (this.items.some((item) => item.commentId === input.commentId)) {
      throw new ConflictError(`DM log for comment '${input.commentId}' already exists`);
    }
    const log: DmLog = {
      id: randomUUID(),
      ...input,
      createdAt: new Date().toISOString(),
    };
    this.items.push(log);
    return log;
  }
}

export class MockAnalyticsRepository implements IAnalyticsRepository {
  async getLatestWeeklyEvaluation() {
    return loadMockWeeklyEvaluation();
  }
}
