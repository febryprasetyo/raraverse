import { randomUUID } from 'node:crypto';
import {
  loadMockAffiliateLinks,
  loadMockContentAssets,
  loadMockDmLogs,
  loadMockKalodataCandidates,
  loadMockLnkBioMetricsSnapshots,
  loadMockLnkBioSyncLogs,
  loadMockProducts,
  loadMockPublishJobs,
  loadMockScriptGeneratorOutput,
  loadMockThreadsPosts,
  loadMockThreadsSyncLogs,
  loadMockWeeklyEvaluation,
} from '@ebieshop/mocks';
import type {
  AffiliateLink,
  ContentAsset,
  ContentStatus,
  DmLog,
  LnkBioMetricsSnapshot,
  LnkBioSyncLog,
  LnkBioSyncOperation,
  Product,
  ProductStatus,
  PublishJobRecord,
  ThreadsPostRecord,
  ThreadsSyncLog,
  ThreadsSyncOperation,
} from '@ebieshop/shared';
import type {
  IOAuthTokenRepository,
  OAuthProviderName,
  OAuthTokenRecord,
  UpsertOAuthTokenInput,
} from '../services/oauth-refresh.js';
import { ConflictError, NotFoundError } from '../errors.js';
import { assertValidProductTransition } from '../services/product-transitions.js';
import {
  buildDefaultStoryboardPrompt,
  buildDefaultThreadsCopy,
} from './llm-providers.js';
import type {
  CreateContentAssetInput,
  CreateDmLogInput,
  CreateLnkBioMetricsSnapshotInput,
  CreateLnkBioSyncLogInput,
  CreateProductInput,
  CreatePublishJobInput,
  CreateThreadsPostInput,
  CreateThreadsSyncLogInput,
  IAnalyticsRepository,
  IContentAssetRepository,
  IDmLogRepository,
  IKalodataClient,
  ILlmProvider,
  ILnkBioRepository,
  IProductRepository,
  IPublishJobRepository,
  IThreadsRepository,
  KalodataFilterInput,
  ThreadsCopyOutput,
  UpdateContentAssetInput,
  UpdateProductInput,
  UpdatePublishJobInput,
  UpsertAffiliateLinkInput,
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

  async generateScript(input?: {
    product: Product;
    angle: string;
    storyboardPrompt?: string;
  }) {
    const base = loadMockScriptGeneratorOutput();
    if (!input?.product) {
      return base;
    }

    const { product } = input;
    const shortName = product.name.split(' ').slice(0, 3).join(' ');
    const priceText = `Rp${product.priceIdr.toLocaleString('id-ID')}`;
    const resolvedPrompt = (
      input.storyboardPrompt?.trim() || buildDefaultStoryboardPrompt(product)
    ).slice(0, 1000);
    const nicheSlug = product.niche.toLowerCase().replace(/[^a-z0-9]/g, '');
    const nicheTag = `#${nicheSlug || 'rekomendasiproduk'}`;
    const productSlug = shortName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const productSlugTag = `#${productSlug || 'produkpilihan'}`;

    return {
      ...base,
      storyboardPrompt: resolvedPrompt,
      captionSeo: [
        `Rekomendasi ${product.name} (${product.niche}) untuk kebutuhan harian yang praktis dan rapi.`,
        `Dengan harga terjangkau ${priceText}, produk ini dirancang untuk pemakaian nyaman tanpa ribet dan menjaga kualitas tampilan tetap estetik.`,
        `Cocok untuk yang mencari solusi ${product.niche.toLowerCase()} bernilai tinggi dengan harga ekonomis.`,
        `Mau link resminya? Komen ${product.triggerKeyword.toUpperCase()} atau cek nomor #${product.biolinkNumber} di bio.`,
      ]
        .join(' ')
        .slice(0, 2200),
      hashtags: [
        productSlugTag,
        nicheTag,
        '#racuntiktok',
        '#rekomendasiunder100rb',
        '#produkharian',
        '#reviewjujur',
      ],
      pinnedComment: `Link asli ${shortName} (${priceText}) silakan komen ${product.triggerKeyword.toUpperCase()} atau cek nomor #${product.biolinkNumber} di bio ya!`,
      sceneCues: [
        {
          order: 1,
          visualFocus: `Meja estetik dengan dua tangan berbaju rajut cream memegang ${shortName}`,
          doodleText: 'Wajib Punya! ✨',
          durationSec: 4,
        },
        {
          order: 2,
          visualFocus: `Close-up keaslian material dan detail ${shortName} di atas meja`,
          doodleText: 'Asli Kokoh! 💛',
          durationSec: 4,
        },
        {
          order: 3,
          visualFocus: `Dua tangan berbaju rajut cream mendemokan pemakaian ${shortName}`,
          doodleText: 'Praktis Banget! 🌸',
          durationSec: 4.5,
        },
        {
          order: 4,
          visualFocus: `Hasil rapi setelah menggunakan ${shortName} di atas meja`,
          doodleText: 'Auto Rapi! ⭐',
          durationSec: 4,
        },
        {
          order: 5,
          visualFocus: `Highlight harga hemat ${priceText}`,
          doodleText: 'Worth It! 🎀',
          durationSec: 4,
        },
        {
          order: 6,
          visualFocus: `Tangan menunjuk ke arah produk dengan ajakan komen ${product.triggerKeyword}`,
          doodleText: `Komen ${product.triggerKeyword} 💌`,
          durationSec: 4,
        },
      ],
    };
  }

  async generateThreadsCopy(input: {
    product: Product;
    affiliateUrl: string;
  }): Promise<ThreadsCopyOutput> {
    return buildDefaultThreadsCopy(input.product, input.affiliateUrl);
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

  async deleteProduct(id: string): Promise<void> {
    const index = this.items.findIndex((p) => p.id === id);
    if (index === -1) {
      throw new NotFoundError(`Product '${id}' not found`);
    }
    this.items.splice(index, 1);
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

  async deleteContentAsset(id: string): Promise<void> {
    const idx = this.items.findIndex((item) => item.id === id);
    if (idx === -1) {
      throw new NotFoundError(`ContentAsset '${id}' not found`);
    }
    this.items.splice(idx, 1);
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

export class MockPublishJobRepository implements IPublishJobRepository {
  private readonly items: PublishJobRecord[];

  constructor() {
    this.items = loadMockPublishJobs().map((item) => structuredClone(item));
  }

  async listPublishJobs(): Promise<PublishJobRecord[]> {
    return [...this.items];
  }

  async getPublishJobById(id: string): Promise<PublishJobRecord | null> {
    return this.items.find((item) => item.id === id) ?? null;
  }

  async createPublishJob(input: CreatePublishJobInput): Promise<PublishJobRecord> {
    if (
      this.items.some(
        (item) =>
          item.contentAssetId === input.contentAssetId &&
          item.platform === input.platform
      )
    ) {
      throw new ConflictError(
        `Publish job already exists for asset '${input.contentAssetId}' on '${input.platform}'`
      );
    }
    const job: PublishJobRecord = {
      id: randomUUID(),
      contentAssetId: input.contentAssetId,
      productId: input.productId,
      platform: input.platform,
      executionMode: input.executionMode,
      visibility: input.visibility ?? 'PUBLIC',
      scheduledAt: input.scheduledAt,
      publishedAt: null,
      platformPostId: null,
      status: 'QUEUED',
      attemptCount: 0,
      lastError: null,
    };
    this.items.push(job);
    return job;
  }

  async updatePublishJob(
    id: string,
    patch: UpdatePublishJobInput
  ): Promise<PublishJobRecord> {
    const idx = this.items.findIndex((item) => item.id === id);
    if (idx === -1) {
      throw new NotFoundError(`PublishJob '${id}' not found`);
    }
    const updated: PublishJobRecord = {
      ...this.items[idx]!,
      ...patch,
    };
    this.items[idx] = updated;
    return updated;
  }

  async deleteContentAsset(id: string): Promise<void> {
    const idx = this.items.findIndex((item) => item.id === id);
    if (idx === -1) {
      throw new NotFoundError(`ContentAsset '${id}' not found`);
    }
    this.items.splice(idx, 1);
  }
}

export class MockAnalyticsRepository implements IAnalyticsRepository {
  async getLatestWeeklyEvaluation() {
    return loadMockWeeklyEvaluation();
  }
}

export class MockOAuthTokenRepository implements IOAuthTokenRepository {
  private readonly items: (OAuthTokenRecord & { scopes?: string })[] = [];

  async listExpiringWithinDays(days: number): Promise<OAuthTokenRecord[]> {
    const cutoff = Date.now() + days * 86400_000;
    return this.items.filter((i) => i.expiresAt.getTime() <= cutoff && !i.needsReauth);
  }

  async getTokenByProvider(provider: OAuthProviderName): Promise<OAuthTokenRecord | null> {
    return this.items.find((i) => i.provider === provider) ?? null;
  }

  async upsertToken(input: UpsertOAuthTokenInput): Promise<OAuthTokenRecord> {
    const idx = this.items.findIndex(
      (i) =>
        i.provider === input.provider &&
        i.externalAccountId === input.externalAccountId
    );
    if (idx !== -1) {
      const updated = {
        ...this.items[idx]!,
        ...input,
      };
      this.items[idx] = updated;
      return updated;
    }
    const created: OAuthTokenRecord & { scopes?: string } = {
      id: randomUUID(),
      provider: input.provider,
      accountLabel: input.accountLabel,
      externalAccountId: input.externalAccountId,
      encryptedAccessToken: input.encryptedAccessToken,
      encryptedRefreshToken: input.encryptedRefreshToken,
      tokenIv: input.tokenIv,
      tokenAuthTag: input.tokenAuthTag,
      expiresAt: input.expiresAt,
      needsReauth: input.needsReauth,
      scopes: input.scopes,
    };
    this.items.push(created);
    return created;
  }

  async updateToken(
    id: string,
    patch: Partial<OAuthTokenRecord> & { lastRefreshedAt?: Date }
  ): Promise<OAuthTokenRecord> {
    const idx = this.items.findIndex((i) => i.id === id);
    if (idx === -1) {
      throw new NotFoundError(`OAuth token '${id}' not found`);
    }
    const updated = { ...this.items[idx]!, ...patch };
    this.items[idx] = updated;
    return updated;
  }
}

export class MockLnkBioRepository implements ILnkBioRepository {
  private readonly links: AffiliateLink[];
  private readonly logs: LnkBioSyncLog[];
  private readonly snapshots: LnkBioMetricsSnapshot[];

  constructor() {
    this.links = loadMockAffiliateLinks().map((item) => structuredClone(item));
    this.logs = loadMockLnkBioSyncLogs().map((item) => structuredClone(item));
    this.snapshots = loadMockLnkBioMetricsSnapshots().map((item) => structuredClone(item));
  }

  async listAffiliateLinks(): Promise<AffiliateLink[]> {
    return [...this.links].sort((a, b) => a.position - b.position);
  }

  async getAffiliateLinkByProductId(productId: string): Promise<AffiliateLink | null> {
    return this.links.find((l) => l.productId === productId) ?? null;
  }

  async getAffiliateLinkByRedirectCode(code: string): Promise<AffiliateLink | null> {
    const normalized = code.trim().toUpperCase();
    return this.links.find((l) => l.redirectCode.toUpperCase() === normalized) ?? null;
  }

  async upsertAffiliateLink(input: UpsertAffiliateLinkInput): Promise<AffiliateLink> {
    const now = new Date().toISOString();
    const idx = this.links.findIndex((l) => l.productId === input.productId);
    if (idx !== -1) {
      const existing = this.links[idx]!;
      const updated: AffiliateLink = {
        ...existing,
        lnkBioId: input.lnkBioId,
        biolinkNumber: input.biolinkNumber,
        redirectCode: input.redirectCode.toUpperCase(),
        title: input.title,
        targetUrl: input.targetUrl,
        trackedUrl: input.trackedUrl,
        imageUrl: input.imageUrl ?? null,
        groupId: input.groupId ?? null,
        groupName: input.groupName ?? null,
        position: input.position,
        scheduleFrom: input.scheduleFrom ?? null,
        scheduleTo: input.scheduleTo ?? null,
        syncStatus: input.syncStatus,
        isActive: input.isActive,
        lnkBioClicks: input.lnkBioClicks ?? existing.lnkBioClicks,
        lastSyncedAt: input.lastSyncedAt ?? existing.lastSyncedAt,
        updatedAt: now,
      };
      this.links[idx] = updated;
      return updated;
    }

    const created: AffiliateLink = {
      id: randomUUID(),
      productId: input.productId,
      lnkBioId: input.lnkBioId,
      biolinkNumber: input.biolinkNumber,
      redirectCode: input.redirectCode.toUpperCase(),
      title: input.title,
      targetUrl: input.targetUrl,
      trackedUrl: input.trackedUrl,
      imageUrl: input.imageUrl ?? null,
      groupId: input.groupId ?? null,
      groupName: input.groupName ?? null,
      position: input.position,
      scheduleFrom: input.scheduleFrom ?? null,
      scheduleTo: input.scheduleTo ?? null,
      syncStatus: input.syncStatus,
      isActive: input.isActive,
      internalClicks: 0,
      lnkBioClicks: input.lnkBioClicks ?? 0,
      lastSyncedAt: input.lastSyncedAt ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.links.push(created);
    return created;
  }

  async incrementInternalClicks(id: string): Promise<AffiliateLink> {
    const idx = this.links.findIndex((l) => l.id === id);
    if (idx === -1) {
      throw new NotFoundError(`AffiliateLink '${id}' not found`);
    }
    const existing = this.links[idx]!;
    const updated: AffiliateLink = {
      ...existing,
      internalClicks: existing.internalClicks + 1,
      updatedAt: new Date().toISOString(),
    };
    this.links[idx] = updated;
    return updated;
  }

  async updateAffiliateLinkClicks(
    id: string,
    patch: { lnkBioClicks?: number; position?: number; lastSyncedAt?: string }
  ): Promise<AffiliateLink> {
    const idx = this.links.findIndex((l) => l.id === id);
    if (idx === -1) {
      throw new NotFoundError(`AffiliateLink '${id}' not found`);
    }
    const existing = this.links[idx]!;
    const updated: AffiliateLink = {
      ...existing,
      ...(patch.lnkBioClicks !== undefined ? { lnkBioClicks: patch.lnkBioClicks } : {}),
      ...(patch.position !== undefined ? { position: patch.position } : {}),
      ...(patch.lastSyncedAt !== undefined ? { lastSyncedAt: patch.lastSyncedAt } : {}),
      updatedAt: new Date().toISOString(),
    };
    this.links[idx] = updated;
    return updated;
  }

  async markAffiliateLinkDeleted(productId: string): Promise<AffiliateLink | null> {
    const idx = this.links.findIndex((l) => l.productId === productId);
    if (idx === -1) return null;
    const existing = this.links[idx]!;
    const updated: AffiliateLink = {
      ...existing,
      isActive: false,
      syncStatus: 'DELETED',
      lnkBioId: null,
      updatedAt: new Date().toISOString(),
    };
    this.links[idx] = updated;
    return updated;
  }

  async listSyncLogs(filter?: {
    limit?: number;
    operation?: LnkBioSyncOperation;
    status?: 'SUCCESS' | 'FAILED';
  }): Promise<LnkBioSyncLog[]> {
    let items = [...this.logs].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    if (filter?.operation) {
      items = items.filter((i) => i.operation === filter.operation);
    }
    if (filter?.status) {
      items = items.filter((i) => i.status === filter.status);
    }
    return items.slice(0, filter?.limit ?? 50);
  }

  async createSyncLog(input: CreateLnkBioSyncLogInput): Promise<LnkBioSyncLog> {
    const item: LnkBioSyncLog = {
      id: randomUUID(),
      ...input,
      createdAt: new Date().toISOString(),
    };
    this.logs.unshift(item);
    return item;
  }

  async listMetricsSnapshots(filter?: {
    productId?: string;
    limit?: number;
  }): Promise<LnkBioMetricsSnapshot[]> {
    let items = [...this.snapshots].sort(
      (a, b) => new Date(b.snapshotDate).getTime() - new Date(a.snapshotDate).getTime()
    );
    if (filter?.productId) {
      items = items.filter((i) => i.productId === filter.productId);
    }
    return items.slice(0, filter?.limit ?? 100);
  }

  async createMetricsSnapshot(
    input: CreateLnkBioMetricsSnapshotInput
  ): Promise<LnkBioMetricsSnapshot> {
    const item: LnkBioMetricsSnapshot = {
      id: randomUUID(),
      ...input,
      createdAt: new Date().toISOString(),
    };
    this.snapshots.unshift(item);
    return item;
  }
}

export class MockThreadsRepository implements IThreadsRepository {
  private readonly posts: ThreadsPostRecord[] = loadMockThreadsPosts();
  private readonly logs: ThreadsSyncLog[] = loadMockThreadsSyncLogs();

  async listPosts(filter?: {
    productId?: string;
    limit?: number;
  }): Promise<ThreadsPostRecord[]> {
    let items = [...this.posts].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    if (filter?.productId) {
      items = items.filter((p) => p.productId === filter.productId);
    }
    return items.slice(0, filter?.limit ?? 50);
  }

  async createPost(input: CreateThreadsPostInput): Promise<ThreadsPostRecord> {
    const now = new Date().toISOString();
    const record: ThreadsPostRecord = {
      id: randomUUID(),
      ...input,
      viewsCount: 0,
      likesCount: 0,
      repliesCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.posts.unshift(record);
    return record;
  }

  async listSyncLogs(filter?: {
    limit?: number;
    operation?: ThreadsSyncOperation;
    status?: 'SUCCESS' | 'FAILED';
  }): Promise<ThreadsSyncLog[]> {
    let items = [...this.logs].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    if (filter?.operation) {
      items = items.filter((i) => i.operation === filter.operation);
    }
    if (filter?.status) {
      items = items.filter((i) => i.status === filter.status);
    }
    return items.slice(0, filter?.limit ?? 50);
  }

  async createSyncLog(input: CreateThreadsSyncLogInput): Promise<ThreadsSyncLog> {
    const item: ThreadsSyncLog = {
      id: randomUUID(),
      ...input,
      createdAt: new Date().toISOString(),
    };
    this.logs.unshift(item);
    return item;
  }
}
