import {
  and,
  contentAssets,
  createDbClient,
  desc,
  dmLogs,
  eq,
  lte,
  oauthTokens,
  productMetricsWeekly,
  products,
  publishJobs,
} from '@ebieshop/db';
import type {
  IOAuthTokenRepository,
  OAuthTokenRecord,
} from '../services/oauth-refresh.js';
import type {
  ContentAsset,
  ContentStatus,
  DmLog,
  Product,
  ProductStatus,
  PublishJobRecord,
  WeeklyEvaluationReport,
  WeeklyRecommendation,
} from '@ebieshop/shared';
import { ConflictError, NotFoundError } from '../errors.js';
import { assertValidProductTransition } from '../services/product-transitions.js';
import type {
  CreateContentAssetInput,
  CreateDmLogInput,
  CreateProductInput,
  CreatePublishJobInput,
  IAnalyticsRepository,
  IContentAssetRepository,
  IDmLogRepository,
  IProductRepository,
  IPublishJobRepository,
  UpdateContentAssetInput,
  UpdateProductInput,
  UpdatePublishJobInput,
} from './contracts.js';

type DbInstance = ReturnType<typeof createDbClient>['db'];

function mapProductRow(row: typeof products.$inferSelect): Product {
  return {
    id: row.id,
    kalodataProductId: row.kalodataProductId,
    niche: row.niche,
    name: row.name,
    priceIdr: row.priceIdr,
    rating: Number(row.rating),
    commissionRatePct: Number(row.commissionRatePct),
    isCommissionXtra: row.isCommissionXtra,
    isOfficialStore: row.isOfficialStore,
    biolinkNumber: row.biolinkNumber,
    triggerKeyword: row.triggerKeyword,
    affiliateUrls: row.affiliateUrls,
    kalodataSnapshot: row.kalodataSnapshot
      ? {
          ...row.kalodataSnapshot,
          referenceVideoUrls: row.kalodataSnapshot.referenceVideoUrls ?? [],
        }
      : null,
    rawMediaDir: row.rawMediaDir,
    rawMediaClipCount: row.rawMediaClipCount,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapContentAssetRow(row: typeof contentAssets.$inferSelect): ContentAsset {
  return {
    id: row.id,
    productId: row.productId,
    llmProvider: row.llmProvider,
    ttsProvider: row.ttsProvider as 'edge-tts' | 'elevenlabs',
    ttsVoiceId: row.ttsVoiceId,
    scriptJson: row.scriptJson,
    audioR2Key: row.audioR2Key,
    subtitleR2Key: row.subtitleR2Key,
    videoR2Key: row.videoR2Key,
    videoSha256: row.videoSha256,
    durationSec: row.durationSec ? Number(row.durationSec) : null,
    resolution: '1080x1920',
    status: row.status,
    rejectionReason: row.rejectionReason,
  };
}

function mapPublishJobRow(row: typeof publishJobs.$inferSelect): PublishJobRecord {
  return {
    id: row.id,
    contentAssetId: row.contentAssetId,
    productId: row.productId,
    platform: row.platform,
    executionMode: row.executionMode,
    visibility: (row.visibility === 'PRIVATE' ? 'PRIVATE' : 'PUBLIC'),
    scheduledAt: row.scheduledAt.toISOString(),
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    platformPostId: row.platformPostId,
    status: row.status,
    attemptCount: row.attemptCount,
    lastError: row.lastError,
  };
}

function mapDmLogRow(row: typeof dmLogs.$inferSelect): DmLog {
  return {
    id: row.id,
    productId: row.productId,
    platform: row.platform === 'FB_REELS' ? 'FB_REELS' : 'IG_REELS',
    mediaId: row.mediaId,
    commentId: row.commentId,
    senderId: row.senderId,
    senderUsername: row.senderUsername,
    commentText: row.commentText,
    matchedKeyword: row.matchedKeyword,
    publicReplySent: row.publicReplySent,
    dmSent: row.dmSent,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

export class DrizzleProductRepository implements IProductRepository {
  constructor(private readonly db: DbInstance) {}

  async listProducts(filter?: { status?: ProductStatus }): Promise<Product[]> {
    const rows = filter?.status
      ? await this.db
          .select()
          .from(products)
          .where(eq(products.status, filter.status))
          .orderBy(desc(products.createdAt))
      : await this.db.select().from(products).orderBy(desc(products.createdAt));
    return rows.map(mapProductRow);
  }

  async getProductById(id: string): Promise<Product | null> {
    const [row] = await this.db.select().from(products).where(eq(products.id, id));
    return row ? mapProductRow(row) : null;
  }

  async findByTriggerKeyword(keyword: string): Promise<Product | null> {
    const [row] = await this.db
      .select()
      .from(products)
      .where(eq(products.triggerKeyword, keyword.trim().toUpperCase()));
    return row ? mapProductRow(row) : null;
  }

  async findByKalodataId(kalodataProductId: string): Promise<Product | null> {
    const [row] = await this.db
      .select()
      .from(products)
      .where(eq(products.kalodataProductId, kalodataProductId));
    return row ? mapProductRow(row) : null;
  }

  async createProduct(input: CreateProductInput): Promise<Product> {
    const normalizedKeyword = input.triggerKeyword.toUpperCase();
    if (await this.findByTriggerKeyword(normalizedKeyword)) {
      throw new ConflictError(`Trigger keyword '${normalizedKeyword}' is already in use`);
    }

    const [row] = await this.db
      .insert(products)
      .values({
        kalodataProductId: input.kalodataProductId ?? null,
        niche: input.niche,
        name: input.name,
        priceIdr: input.priceIdr,
        rating: input.rating.toFixed(2),
        commissionRatePct: input.commissionRatePct.toFixed(2),
        isCommissionXtra: input.isCommissionXtra,
        isOfficialStore: input.isOfficialStore,
        biolinkNumber: input.biolinkNumber,
        triggerKeyword: normalizedKeyword,
        affiliateUrls: input.affiliateUrls,
        kalodataSnapshot: input.kalodataSnapshot ?? null,
        rawMediaDir: input.rawMediaDir,
        rawMediaClipCount: input.rawMediaClipCount,
        status: input.status ?? 'CANDIDATE',
      })
      .returning();
    return mapProductRow(row!);
  }

  async updateProduct(id: string, patch: UpdateProductInput): Promise<Product> {
    const existing = await this.getProductById(id);
    if (!existing) {
      throw new NotFoundError(`Product '${id}' not found`);
    }
    if (patch.status) {
      assertValidProductTransition(existing.status, patch.status);
    }

    const [row] = await this.db
      .update(products)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.priceIdr !== undefined ? { priceIdr: patch.priceIdr } : {}),
        ...(patch.rating !== undefined ? { rating: patch.rating.toFixed(2) } : {}),
        ...(patch.commissionRatePct !== undefined
          ? { commissionRatePct: patch.commissionRatePct.toFixed(2) }
          : {}),
        ...(patch.isCommissionXtra !== undefined
          ? { isCommissionXtra: patch.isCommissionXtra }
          : {}),
        ...(patch.isOfficialStore !== undefined
          ? { isOfficialStore: patch.isOfficialStore }
          : {}),
        ...(patch.biolinkNumber !== undefined
          ? { biolinkNumber: patch.biolinkNumber }
          : {}),
        ...(patch.triggerKeyword !== undefined
          ? { triggerKeyword: patch.triggerKeyword.toUpperCase() }
          : {}),
        ...(patch.affiliateUrls !== undefined
          ? { affiliateUrls: patch.affiliateUrls }
          : {}),
        ...(patch.rawMediaDir !== undefined ? { rawMediaDir: patch.rawMediaDir } : {}),
        ...(patch.rawMediaClipCount !== undefined
          ? { rawMediaClipCount: patch.rawMediaClipCount }
          : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        updatedAt: new Date(),
      })
      .where(eq(products.id, id))
      .returning();
    return mapProductRow(row!);
  }
}

export class DrizzleContentAssetRepository implements IContentAssetRepository {
  constructor(private readonly db: DbInstance) {}

  async listContentAssets(filter?: { status?: ContentStatus }): Promise<ContentAsset[]> {
    const rows = filter?.status
      ? await this.db
          .select()
          .from(contentAssets)
          .where(eq(contentAssets.status, filter.status))
          .orderBy(desc(contentAssets.createdAt))
      : await this.db
          .select()
          .from(contentAssets)
          .orderBy(desc(contentAssets.createdAt));
    return rows.map(mapContentAssetRow);
  }

  async getContentAssetById(id: string): Promise<ContentAsset | null> {
    const [row] = await this.db
      .select()
      .from(contentAssets)
      .where(eq(contentAssets.id, id));
    return row ? mapContentAssetRow(row) : null;
  }

  async createContentAsset(input: CreateContentAssetInput): Promise<ContentAsset> {
    const [row] = await this.db
      .insert(contentAssets)
      .values({
        productId: input.productId,
        llmProvider: input.llmProvider,
        ttsProvider: input.ttsProvider,
        ttsVoiceId: input.ttsVoiceId,
        scriptJson: input.scriptJson,
        status: input.status ?? 'RENDERING_VIDEO',
      })
      .returning();
    return mapContentAssetRow(row!);
  }

  async updateContentAsset(
    id: string,
    patch: UpdateContentAssetInput
  ): Promise<ContentAsset> {
    const [row] = await this.db
      .update(contentAssets)
      .set({
        ...(patch.audioR2Key !== undefined ? { audioR2Key: patch.audioR2Key } : {}),
        ...(patch.subtitleR2Key !== undefined
          ? { subtitleR2Key: patch.subtitleR2Key }
          : {}),
        ...(patch.videoR2Key !== undefined ? { videoR2Key: patch.videoR2Key } : {}),
        ...(patch.videoSha256 !== undefined ? { videoSha256: patch.videoSha256 } : {}),
        ...(patch.durationSec !== undefined
          ? { durationSec: patch.durationSec?.toFixed(2) ?? null }
          : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.rejectionReason !== undefined
          ? { rejectionReason: patch.rejectionReason }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(contentAssets.id, id))
      .returning();
    if (!row) {
      throw new NotFoundError(`ContentAsset '${id}' not found`);
    }
    return mapContentAssetRow(row);
  }
}

export class DrizzlePublishJobRepository implements IPublishJobRepository {
  constructor(private readonly db: DbInstance) {}

  async listPublishJobs(): Promise<PublishJobRecord[]> {
    const rows = await this.db
      .select()
      .from(publishJobs)
      .orderBy(desc(publishJobs.scheduledAt));
    return rows.map(mapPublishJobRow);
  }

  async getPublishJobById(id: string): Promise<PublishJobRecord | null> {
    const [row] = await this.db
      .select()
      .from(publishJobs)
      .where(eq(publishJobs.id, id));
    return row ? mapPublishJobRow(row) : null;
  }

  async createPublishJob(input: CreatePublishJobInput): Promise<PublishJobRecord> {
    const [existing] = await this.db
      .select()
      .from(publishJobs)
      .where(
        and(
          eq(publishJobs.contentAssetId, input.contentAssetId),
          eq(publishJobs.platform, input.platform)
        )
      );
    if (existing) {
      throw new ConflictError(
        `Publish job already exists for asset '${input.contentAssetId}' on '${input.platform}'`
      );
    }

    const [row] = await this.db
      .insert(publishJobs)
      .values({
        contentAssetId: input.contentAssetId,
        productId: input.productId,
        platform: input.platform,
        executionMode: input.executionMode,
        visibility: input.visibility ?? 'PUBLIC',
        scheduledAt: new Date(input.scheduledAt),
        status: 'QUEUED',
      })
      .returning();
    return mapPublishJobRow(row!);
  }

  async updatePublishJob(
    id: string,
    patch: UpdatePublishJobInput
  ): Promise<PublishJobRecord> {
    const [row] = await this.db
      .update(publishJobs)
      .set({
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.publishedAt !== undefined
          ? { publishedAt: patch.publishedAt ? new Date(patch.publishedAt) : null }
          : {}),
        ...(patch.platformPostId !== undefined
          ? { platformPostId: patch.platformPostId }
          : {}),
        ...(patch.attemptCount !== undefined
          ? { attemptCount: patch.attemptCount }
          : {}),
        ...(patch.lastError !== undefined ? { lastError: patch.lastError } : {}),
        updatedAt: new Date(),
      })
      .where(eq(publishJobs.id, id))
      .returning();
    if (!row) {
      throw new NotFoundError(`PublishJob '${id}' not found`);
    }
    return mapPublishJobRow(row);
  }
}

export class DrizzleDmLogRepository implements IDmLogRepository {
  constructor(private readonly db: DbInstance) {}

  async listDmLogs(): Promise<DmLog[]> {
    const rows = await this.db
      .select()
      .from(dmLogs)
      .orderBy(desc(dmLogs.createdAt));
    return rows.map(mapDmLogRow);
  }

  async findByCommentId(commentId: string): Promise<DmLog | null> {
    const [row] = await this.db
      .select()
      .from(dmLogs)
      .where(eq(dmLogs.commentId, commentId));
    return row ? mapDmLogRow(row) : null;
  }

  async createDmLog(input: CreateDmLogInput): Promise<DmLog> {
    const [row] = await this.db
      .insert(dmLogs)
      .values({
        productId: input.productId,
        platform: input.platform,
        mediaId: input.mediaId,
        commentId: input.commentId,
        senderId: input.senderId,
        senderUsername: input.senderUsername,
        commentText: input.commentText,
        matchedKeyword: input.matchedKeyword,
        publicReplySent: input.publicReplySent,
        dmSent: input.dmSent,
        status: input.status,
      })
      .returning();
    return mapDmLogRow(row!);
  }
}

export class DrizzleAnalyticsRepository implements IAnalyticsRepository {
  constructor(private readonly db: DbInstance) {}

  async getLatestWeeklyEvaluation(): Promise<WeeklyEvaluationReport> {
    const rows = await this.db
      .select({
        metric: productMetricsWeekly,
        productName: products.name,
        triggerKeyword: products.triggerKeyword,
      })
      .from(productMetricsWeekly)
      .innerJoin(products, eq(productMetricsWeekly.productId, products.id))
      .orderBy(desc(productMetricsWeekly.weekStartDate));

    const weekStart = rows[0]?.metric.weekStartDate ?? new Date();
    return {
      weekStartDate: weekStart.toISOString(),
      generatedAt: new Date().toISOString(),
      items: rows.map((r) => ({
        productId: r.metric.productId,
        productName: r.productName,
        triggerKeyword: r.triggerKeyword,
        videosPublished: r.metric.videosPublished,
        totalViews: r.metric.totalViews,
        totalTriggerComments: r.metric.totalTriggerComments,
        totalDmSent: r.metric.totalDmSent,
        estimatedClicks: r.metric.estimatedClicks,
        estimatedCommissionIdr: r.metric.estimatedCommissionIdr,
        recommendation: r.metric.recommendation as WeeklyRecommendation,
        operatorDecision: (r.metric.operatorDecision as
          | 'APPLIED'
          | 'OVERRIDDEN'
          | 'PENDING'
          | null) ?? 'PENDING',
      })),
    };
  }
}

export class DrizzleOAuthTokenRepository implements IOAuthTokenRepository {
  constructor(private readonly db: DbInstance) {}

  async listExpiringWithinDays(days: number): Promise<OAuthTokenRecord[]> {
    const cutoff = new Date(Date.now() + days * 86400_000);
    const rows = await this.db
      .select()
      .from(oauthTokens)
      .where(and(lte(oauthTokens.expiresAt, cutoff), eq(oauthTokens.needsReauth, false)));

    return rows.map((row) => ({
      id: row.id,
      provider: row.provider === 'youtube' ? 'youtube' : 'meta',
      accountLabel: row.accountLabel,
      externalAccountId: row.externalAccountId,
      encryptedAccessToken: row.encryptedAccessToken,
      encryptedRefreshToken: row.encryptedRefreshToken,
      tokenIv: row.tokenIv,
      tokenAuthTag: row.tokenAuthTag,
      expiresAt: row.expiresAt,
      needsReauth: row.needsReauth,
    }));
  }

  async updateToken(
    id: string,
    patch: Partial<OAuthTokenRecord> & { lastRefreshedAt?: Date }
  ): Promise<OAuthTokenRecord> {
    const [row] = await this.db
      .update(oauthTokens)
      .set({
        ...(patch.encryptedAccessToken !== undefined
          ? { encryptedAccessToken: patch.encryptedAccessToken }
          : {}),
        ...(patch.encryptedRefreshToken !== undefined
          ? { encryptedRefreshToken: patch.encryptedRefreshToken }
          : {}),
        ...(patch.tokenIv !== undefined ? { tokenIv: patch.tokenIv } : {}),
        ...(patch.tokenAuthTag !== undefined
          ? { tokenAuthTag: patch.tokenAuthTag }
          : {}),
        ...(patch.expiresAt !== undefined ? { expiresAt: patch.expiresAt } : {}),
        ...(patch.lastRefreshedAt !== undefined
          ? { lastRefreshedAt: patch.lastRefreshedAt }
          : {}),
        ...(patch.needsReauth !== undefined
          ? { needsReauth: patch.needsReauth }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(oauthTokens.id, id))
      .returning();

    if (!row) {
      throw new NotFoundError(`OAuth token '${id}' not found`);
    }

    return {
      id: row.id,
      provider: row.provider === 'youtube' ? 'youtube' : 'meta',
      accountLabel: row.accountLabel,
      externalAccountId: row.externalAccountId,
      encryptedAccessToken: row.encryptedAccessToken,
      encryptedRefreshToken: row.encryptedRefreshToken,
      tokenIv: row.tokenIv,
      tokenAuthTag: row.tokenAuthTag,
      expiresAt: row.expiresAt,
      needsReauth: row.needsReauth,
    };
  }
}
