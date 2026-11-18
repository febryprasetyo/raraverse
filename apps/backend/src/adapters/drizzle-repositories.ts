import {
  affiliateLinks,
  and,
  asc,
  contentAssets,
  createDbClient,
  desc,
  dmLogs,
  eq,
  lnkBioMetricsSnapshots,
  lnkBioSyncLogs,
  lte,
  oauthTokens,
  productMetricsWeekly,
  products,
  publishJobs,
  sql,
  threadsPosts,
  threadsSyncLogs,
} from '@ebieshop/db';
import type {
  IOAuthTokenRepository,
  OAuthProviderName,
  OAuthTokenRecord,
  UpsertOAuthTokenInput,
} from '../services/oauth-refresh.js';
import type {
  AffiliateLink,
  ContentAsset,
  ContentStatus,
  DmLog,
  LnkBioMetricsSnapshot,
  LnkBioSyncLog,
  LnkBioSyncOperation,
  LnkBioSyncStatus,
  Product,
  ProductStatus,
  PublishJobRecord,
  ThreadsMediaType,
  ThreadsPostRecord,
  ThreadsPostStatus,
  ThreadsSyncLog,
  ThreadsSyncOperation,
  WeeklyEvaluationReport,
  WeeklyRecommendation,
} from '@ebieshop/shared';
import { ConflictError, NotFoundError } from '../errors.js';
import { assertValidProductTransition } from '../services/product-transitions.js';
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
  ILnkBioRepository,
  IProductRepository,
  IPublishJobRepository,
  IThreadsRepository,
  UpdateContentAssetInput,
  UpdateProductInput,
  UpdatePublishJobInput,
  UpsertAffiliateLinkInput,
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
          referenceVideos: row.kalodataSnapshot.referenceVideos ?? [],
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
        ...(patch.kalodataSnapshot !== undefined
          ? { kalodataSnapshot: patch.kalodataSnapshot }
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

  async deleteProduct(id: string): Promise<void> {
    const deleted = await this.db
      .delete(products)
      .where(eq(products.id, id))
      .returning({ id: products.id });
    if (deleted.length === 0) {
      throw new NotFoundError(`Product '${id}' not found`);
    }
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
        ...(patch.scriptJson !== undefined ? { scriptJson: patch.scriptJson } : {}),
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

  async deleteContentAsset(id: string): Promise<void> {
    const deleted = await this.db
      .delete(contentAssets)
      .where(eq(contentAssets.id, id))
      .returning({ id: contentAssets.id });
    if (deleted.length === 0) {
      throw new NotFoundError(`ContentAsset '${id}' not found`);
    }
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

function normalizeOAuthProvider(provider: string): OAuthProviderName {
  if (provider === 'youtube' || provider === 'lnkbio' || provider === 'threads') {
    return provider;
  }
  return 'meta';
}

function mapOAuthTokenRow(row: typeof oauthTokens.$inferSelect): OAuthTokenRecord {
  return {
    id: row.id,
    provider: normalizeOAuthProvider(row.provider),
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

export class DrizzleOAuthTokenRepository implements IOAuthTokenRepository {
  constructor(private readonly db: DbInstance) {}

  async listExpiringWithinDays(days: number): Promise<OAuthTokenRecord[]> {
    const cutoff = new Date(Date.now() + days * 86400_000);
    const rows = await this.db
      .select()
      .from(oauthTokens)
      .where(and(lte(oauthTokens.expiresAt, cutoff), eq(oauthTokens.needsReauth, false)));

    return rows.map(mapOAuthTokenRow);
  }

  async getTokenByProvider(provider: OAuthProviderName): Promise<OAuthTokenRecord | null> {
    const [row] = await this.db
      .select()
      .from(oauthTokens)
      .where(eq(oauthTokens.provider, provider))
      .orderBy(desc(oauthTokens.updatedAt))
      .limit(1);
    return row ? mapOAuthTokenRow(row) : null;
  }

  async upsertToken(input: UpsertOAuthTokenInput): Promise<OAuthTokenRecord> {
    const [row] = await this.db
      .insert(oauthTokens)
      .values({
        provider: input.provider,
        accountLabel: input.accountLabel,
        externalAccountId: input.externalAccountId,
        encryptedAccessToken: input.encryptedAccessToken,
        encryptedRefreshToken: input.encryptedRefreshToken,
        tokenIv: input.tokenIv,
        tokenAuthTag: input.tokenAuthTag,
        scopes: input.scopes,
        expiresAt: input.expiresAt,
        lastRefreshedAt: new Date(),
        needsReauth: input.needsReauth,
      })
      .onConflictDoUpdate({
        target: [oauthTokens.provider, oauthTokens.externalAccountId],
        set: {
          accountLabel: input.accountLabel,
          encryptedAccessToken: input.encryptedAccessToken,
          encryptedRefreshToken: input.encryptedRefreshToken,
          tokenIv: input.tokenIv,
          tokenAuthTag: input.tokenAuthTag,
          scopes: input.scopes,
          expiresAt: input.expiresAt,
          lastRefreshedAt: new Date(),
          needsReauth: input.needsReauth,
          updatedAt: new Date(),
        },
      })
      .returning();

    return mapOAuthTokenRow(row!);
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

    return mapOAuthTokenRow(row);
  }
}

function mapAffiliateLinkRow(row: typeof affiliateLinks.$inferSelect): AffiliateLink {
  return {
    id: row.id,
    productId: row.productId,
    lnkBioId: row.lnkBioId,
    biolinkNumber: row.biolinkNumber,
    redirectCode: row.redirectCode,
    title: row.title,
    targetUrl: row.targetUrl,
    trackedUrl: row.trackedUrl,
    imageUrl: row.imageUrl,
    groupId: row.groupId,
    groupName: row.groupName,
    position: row.position,
    scheduleFrom: row.scheduleFrom ? row.scheduleFrom.toISOString() : null,
    scheduleTo: row.scheduleTo ? row.scheduleTo.toISOString() : null,
    syncStatus: row.syncStatus as LnkBioSyncStatus,
    isActive: row.isActive,
    internalClicks: row.internalClicks,
    lnkBioClicks: row.lnkBioClicks,
    lastSyncedAt: row.lastSyncedAt ? row.lastSyncedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapSyncLogRow(row: typeof lnkBioSyncLogs.$inferSelect): LnkBioSyncLog {
  return {
    id: row.id,
    productId: row.productId,
    affiliateLinkId: row.affiliateLinkId,
    operation: row.operation as LnkBioSyncOperation,
    status: row.status as 'SUCCESS' | 'FAILED',
    httpStatus: row.httpStatus,
    requestPayload: row.requestPayload,
    responsePayload: row.responsePayload,
    errorMessage: row.errorMessage,
    attemptCount: row.attemptCount,
    durationMs: row.durationMs,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapSnapshotRow(
  row: typeof lnkBioMetricsSnapshots.$inferSelect
): LnkBioMetricsSnapshot {
  return {
    id: row.id,
    productId: row.productId,
    affiliateLinkId: row.affiliateLinkId,
    lnkBioId: row.lnkBioId,
    snapshotDate: row.snapshotDate.toISOString(),
    lnkBioClicks: row.lnkBioClicks,
    internalRedirectClicks: row.internalRedirectClicks,
    totalTrackedClicks: row.totalTrackedClicks,
    ctrPct: Number(row.ctrPct),
    estimatedCommissionIdr: row.estimatedCommissionIdr,
    performanceScore: Number(row.performanceScore),
    utmBreakdown: row.utmBreakdown,
    createdAt: row.createdAt.toISOString(),
  };
}

export class DrizzleLnkBioRepository implements ILnkBioRepository {
  constructor(private readonly db: DbInstance) {}

  async listAffiliateLinks(): Promise<AffiliateLink[]> {
    const rows = await this.db
      .select()
      .from(affiliateLinks)
      .orderBy(asc(affiliateLinks.position), asc(affiliateLinks.biolinkNumber));
    return rows.map(mapAffiliateLinkRow);
  }

  async getAffiliateLinkByProductId(productId: string): Promise<AffiliateLink | null> {
    const [row] = await this.db
      .select()
      .from(affiliateLinks)
      .where(eq(affiliateLinks.productId, productId));
    return row ? mapAffiliateLinkRow(row) : null;
  }

  async getAffiliateLinkByRedirectCode(code: string): Promise<AffiliateLink | null> {
    const [row] = await this.db
      .select()
      .from(affiliateLinks)
      .where(eq(affiliateLinks.redirectCode, code.trim().toUpperCase()));
    return row ? mapAffiliateLinkRow(row) : null;
  }

  async upsertAffiliateLink(input: UpsertAffiliateLinkInput): Promise<AffiliateLink> {
    const [row] = await this.db
      .insert(affiliateLinks)
      .values({
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
        scheduleFrom: input.scheduleFrom ? new Date(input.scheduleFrom) : null,
        scheduleTo: input.scheduleTo ? new Date(input.scheduleTo) : null,
        syncStatus: input.syncStatus,
        isActive: input.isActive,
        lnkBioClicks: input.lnkBioClicks ?? 0,
        lastSyncedAt: input.lastSyncedAt ? new Date(input.lastSyncedAt) : null,
      })
      .onConflictDoUpdate({
        target: affiliateLinks.productId,
        set: {
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
          scheduleFrom: input.scheduleFrom ? new Date(input.scheduleFrom) : null,
          scheduleTo: input.scheduleTo ? new Date(input.scheduleTo) : null,
          syncStatus: input.syncStatus,
          isActive: input.isActive,
          ...(input.lnkBioClicks !== undefined
            ? { lnkBioClicks: input.lnkBioClicks }
            : {}),
          lastSyncedAt: input.lastSyncedAt ? new Date(input.lastSyncedAt) : null,
          updatedAt: new Date(),
        },
      })
      .returning();

    return mapAffiliateLinkRow(row!);
  }

  async incrementInternalClicks(id: string): Promise<AffiliateLink> {
    const [row] = await this.db
      .update(affiliateLinks)
      .set({
        internalClicks: sql`${affiliateLinks.internalClicks} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(affiliateLinks.id, id))
      .returning();

    if (!row) {
      throw new NotFoundError(`AffiliateLink '${id}' not found`);
    }
    return mapAffiliateLinkRow(row);
  }

  async updateAffiliateLinkClicks(
    id: string,
    patch: { lnkBioClicks?: number; position?: number; lastSyncedAt?: string }
  ): Promise<AffiliateLink> {
    const [row] = await this.db
      .update(affiliateLinks)
      .set({
        ...(patch.lnkBioClicks !== undefined ? { lnkBioClicks: patch.lnkBioClicks } : {}),
        ...(patch.position !== undefined ? { position: patch.position } : {}),
        ...(patch.lastSyncedAt !== undefined
          ? { lastSyncedAt: new Date(patch.lastSyncedAt) }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(affiliateLinks.id, id))
      .returning();

    if (!row) {
      throw new NotFoundError(`AffiliateLink '${id}' not found`);
    }
    return mapAffiliateLinkRow(row);
  }

  async markAffiliateLinkDeleted(productId: string): Promise<AffiliateLink | null> {
    const [row] = await this.db
      .update(affiliateLinks)
      .set({
        isActive: false,
        syncStatus: 'DELETED',
        lnkBioId: null,
        updatedAt: new Date(),
      })
      .where(eq(affiliateLinks.productId, productId))
      .returning();
    return row ? mapAffiliateLinkRow(row) : null;
  }

  async listSyncLogs(filter?: {
    limit?: number;
    operation?: LnkBioSyncOperation;
    status?: 'SUCCESS' | 'FAILED';
  }): Promise<LnkBioSyncLog[]> {
    const conditions = [];
    if (filter?.operation) {
      conditions.push(eq(lnkBioSyncLogs.operation, filter.operation));
    }
    if (filter?.status) {
      conditions.push(eq(lnkBioSyncLogs.status, filter.status));
    }

    const baseQuery = this.db.select().from(lnkBioSyncLogs);
    const filteredQuery =
      conditions.length > 0 ? baseQuery.where(and(...conditions)) : baseQuery;
    const rows = await filteredQuery
      .orderBy(desc(lnkBioSyncLogs.createdAt))
      .limit(filter?.limit ?? 50);

    return rows.map(mapSyncLogRow);
  }

  async createSyncLog(input: CreateLnkBioSyncLogInput): Promise<LnkBioSyncLog> {
    const [row] = await this.db
      .insert(lnkBioSyncLogs)
      .values({
        productId: input.productId,
        affiliateLinkId: input.affiliateLinkId,
        operation: input.operation,
        status: input.status,
        httpStatus: input.httpStatus,
        requestPayload: input.requestPayload,
        responsePayload: input.responsePayload,
        errorMessage: input.errorMessage,
        attemptCount: input.attemptCount,
        durationMs: input.durationMs,
      })
      .returning();
    return mapSyncLogRow(row!);
  }

  async listMetricsSnapshots(filter?: {
    productId?: string;
    limit?: number;
  }): Promise<LnkBioMetricsSnapshot[]> {
    const baseQuery = this.db.select().from(lnkBioMetricsSnapshots);
    const filteredQuery = filter?.productId
      ? baseQuery.where(eq(lnkBioMetricsSnapshots.productId, filter.productId))
      : baseQuery;
    const rows = await filteredQuery
      .orderBy(desc(lnkBioMetricsSnapshots.snapshotDate))
      .limit(filter?.limit ?? 100);
    return rows.map(mapSnapshotRow);
  }

  async createMetricsSnapshot(
    input: CreateLnkBioMetricsSnapshotInput
  ): Promise<LnkBioMetricsSnapshot> {
    const [row] = await this.db
      .insert(lnkBioMetricsSnapshots)
      .values({
        productId: input.productId,
        affiliateLinkId: input.affiliateLinkId,
        lnkBioId: input.lnkBioId,
        snapshotDate: new Date(input.snapshotDate),
        lnkBioClicks: input.lnkBioClicks,
        internalRedirectClicks: input.internalRedirectClicks,
        totalTrackedClicks: input.totalTrackedClicks,
        ctrPct: input.ctrPct.toFixed(2),
        estimatedCommissionIdr: input.estimatedCommissionIdr,
        performanceScore: input.performanceScore.toFixed(2),
        utmBreakdown: input.utmBreakdown,
      })
      .returning();
    return mapSnapshotRow(row!);
  }
}

function mapThreadsPostRow(row: typeof threadsPosts.$inferSelect): ThreadsPostRecord {
  return {
    id: row.id,
    productId: row.productId,
    rootPostId: row.rootPostId,
    replyPostId: row.replyPostId,
    permalink: row.permalink,
    username: row.username,
    mediaType: row.mediaType as ThreadsMediaType,
    rootText: row.rootText,
    replyText: row.replyText,
    mediaUrl: row.mediaUrl,
    affiliateUrl: row.affiliateUrl,
    status: row.status as ThreadsPostStatus,
    viewsCount: row.viewsCount,
    likesCount: row.likesCount,
    repliesCount: row.repliesCount,
    errorMessage: row.errorMessage,
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapThreadsSyncLogRow(
  row: typeof threadsSyncLogs.$inferSelect
): ThreadsSyncLog {
  return {
    id: row.id,
    productId: row.productId,
    threadsPostId: row.threadsPostId,
    operation: row.operation as ThreadsSyncOperation,
    status: row.status as 'SUCCESS' | 'FAILED',
    httpStatus: row.httpStatus,
    requestPayload: row.requestPayload,
    responsePayload: row.responsePayload,
    errorMessage: row.errorMessage,
    durationMs: row.durationMs,
    createdAt: row.createdAt.toISOString(),
  };
}

export class DrizzleThreadsRepository implements IThreadsRepository {
  constructor(private readonly db: DbInstance) {}

  async listPosts(filter?: {
    productId?: string;
    limit?: number;
  }): Promise<ThreadsPostRecord[]> {
    const baseQuery = this.db.select().from(threadsPosts);
    const filteredQuery = filter?.productId
      ? baseQuery.where(eq(threadsPosts.productId, filter.productId))
      : baseQuery;
    const rows = await filteredQuery
      .orderBy(desc(threadsPosts.createdAt))
      .limit(filter?.limit ?? 50);
    return rows.map(mapThreadsPostRow);
  }

  async createPost(input: CreateThreadsPostInput): Promise<ThreadsPostRecord> {
    const [row] = await this.db
      .insert(threadsPosts)
      .values({
        productId: input.productId,
        rootPostId: input.rootPostId,
        replyPostId: input.replyPostId,
        permalink: input.permalink,
        username: input.username,
        mediaType: input.mediaType,
        rootText: input.rootText,
        replyText: input.replyText,
        mediaUrl: input.mediaUrl,
        affiliateUrl: input.affiliateUrl,
        status: input.status,
        errorMessage: input.errorMessage,
        publishedAt: input.publishedAt ? new Date(input.publishedAt) : null,
      })
      .returning();
    return mapThreadsPostRow(row!);
  }

  async listSyncLogs(filter?: {
    limit?: number;
    operation?: ThreadsSyncOperation;
    status?: 'SUCCESS' | 'FAILED';
  }): Promise<ThreadsSyncLog[]> {
    const conditions = [];
    if (filter?.operation) {
      conditions.push(eq(threadsSyncLogs.operation, filter.operation));
    }
    if (filter?.status) {
      conditions.push(eq(threadsSyncLogs.status, filter.status));
    }
    const baseQuery = this.db.select().from(threadsSyncLogs);
    const filteredQuery =
      conditions.length > 0 ? baseQuery.where(and(...conditions)) : baseQuery;
    const rows = await filteredQuery
      .orderBy(desc(threadsSyncLogs.createdAt))
      .limit(filter?.limit ?? 50);
    return rows.map(mapThreadsSyncLogRow);
  }

  async createSyncLog(input: CreateThreadsSyncLogInput): Promise<ThreadsSyncLog> {
    const [row] = await this.db
      .insert(threadsSyncLogs)
      .values({
        productId: input.productId,
        threadsPostId: input.threadsPostId,
        operation: input.operation,
        status: input.status,
        httpStatus: input.httpStatus,
        requestPayload: input.requestPayload,
        responsePayload: input.responsePayload,
        errorMessage: input.errorMessage,
        durationMs: input.durationMs,
      })
      .returning();
    return mapThreadsSyncLogRow(row!);
  }
}
