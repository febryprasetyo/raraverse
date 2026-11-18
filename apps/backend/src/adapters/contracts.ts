import type {
  AffiliateLink,
  AffiliateUrls,
  ContentAsset,
  ContentStatus,
  DmLog,
  DmStatus,
  ExecutionMode,
  KalodataCandidate,
  KalodataSnapshot,
  LnkBioMetricsSnapshot,
  LnkBioSyncLog,
  LnkBioSyncOperation,
  LnkBioSyncStatus,
  Product,
  ProductStatus,
  PublishJobRecord,
  PublishStatus,
  ScriptGeneratorOutput,
  TargetPlatform,
  ThreadsMediaType,
  ThreadsPostRecord,
  ThreadsPostStatus,
  ThreadsSyncLog,
  ThreadsSyncOperation,
  WeeklyEvaluationReport,
} from '@ebieshop/shared';

export interface KalodataFilterInput {
  niche: string;
  maxPriceIdr: number;
  minRating: number;
  limit: number;
}

export interface IKalodataClient {
  fetchWinningCandidates(filter: KalodataFilterInput): Promise<KalodataCandidate[]>;
}

export interface ThreadsCopyOutput {
  rootText: string;
  replyText: string;
}

export interface ILlmProvider {
  readonly providerName?: string;
  generateScript(input: {
    product: Product;
    angle: string;
    storyboardPrompt?: string;
  }): Promise<ScriptGeneratorOutput>;
  generateTriggerKeyword?(input: {
    product: Product;
    biolinkNumber: string;
    usedKeywords: string[];
  }): Promise<string>;
  generateThreadsCopy?(input: {
    product: Product;
    affiliateUrl: string;
  }): Promise<ThreadsCopyOutput>;
}

export interface CreateProductInput {
  kalodataProductId?: string | null;
  niche: string;
  name: string;
  priceIdr: number;
  rating: number;
  commissionRatePct: number;
  isCommissionXtra: boolean;
  isOfficialStore: boolean;
  biolinkNumber: string;
  triggerKeyword: string;
  affiliateUrls: AffiliateUrls;
  kalodataSnapshot?: KalodataSnapshot | null;
  rawMediaDir: string;
  rawMediaClipCount: number;
  status?: ProductStatus;
}

export interface UpdateProductInput {
  name?: string;
  priceIdr?: number;
  rating?: number;
  commissionRatePct?: number;
  isCommissionXtra?: boolean;
  isOfficialStore?: boolean;
  biolinkNumber?: string;
  triggerKeyword?: string;
  affiliateUrls?: AffiliateUrls;
  kalodataSnapshot?: KalodataSnapshot | null;
  rawMediaDir?: string;
  rawMediaClipCount?: number;
  status?: ProductStatus;
}

export interface IProductRepository {
  listProducts(filter?: { status?: ProductStatus }): Promise<Product[]>;
  getProductById(id: string): Promise<Product | null>;
  findByTriggerKeyword(keyword: string): Promise<Product | null>;
  findByKalodataId(kalodataProductId: string): Promise<Product | null>;
  createProduct(input: CreateProductInput): Promise<Product>;
  updateProduct(id: string, patch: UpdateProductInput): Promise<Product>;
  deleteProduct(id: string): Promise<void>;
}

export interface CreateContentAssetInput {
  productId: string;
  llmProvider: string;
  ttsProvider: 'edge-tts' | 'elevenlabs';
  ttsVoiceId: string;
  scriptJson: ScriptGeneratorOutput;
  status?: ContentStatus;
}

export interface UpdateContentAssetInput {
  scriptJson?: ScriptGeneratorOutput;
  audioR2Key?: string | null;
  subtitleR2Key?: string | null;
  videoR2Key?: string | null;
  videoSha256?: string | null;
  durationSec?: number | null;
  status?: ContentStatus;
  rejectionReason?: string | null;
}

export interface IContentAssetRepository {
  listContentAssets(filter?: { status?: ContentStatus }): Promise<ContentAsset[]>;
  getContentAssetById(id: string): Promise<ContentAsset | null>;
  createContentAsset(input: CreateContentAssetInput): Promise<ContentAsset>;
  updateContentAsset(id: string, patch: UpdateContentAssetInput): Promise<ContentAsset>;
  deleteContentAsset(id: string): Promise<void>;
}

export interface CreateDmLogInput {
  productId: string | null;
  platform: 'IG_REELS' | 'FB_REELS';
  mediaId: string;
  commentId: string;
  senderId: string;
  senderUsername: string | null;
  commentText: string;
  matchedKeyword: string | null;
  publicReplySent: boolean;
  dmSent: boolean;
  status: DmStatus;
}

export interface IDmLogRepository {
  listDmLogs(): Promise<DmLog[]>;
  findByCommentId(commentId: string): Promise<DmLog | null>;
  createDmLog(input: CreateDmLogInput): Promise<DmLog>;
}

export interface CreatePublishJobInput {
  contentAssetId: string;
  productId: string;
  platform: TargetPlatform;
  executionMode: ExecutionMode;
  visibility?: 'PUBLIC' | 'PRIVATE';
  scheduledAt: string;
}

export interface UpdatePublishJobInput {
  status?: PublishStatus;
  publishedAt?: string | null;
  platformPostId?: string | null;
  attemptCount?: number;
  lastError?: string | null;
}

export interface IPublishJobRepository {
  listPublishJobs(): Promise<PublishJobRecord[]>;
  getPublishJobById(id: string): Promise<PublishJobRecord | null>;
  createPublishJob(input: CreatePublishJobInput): Promise<PublishJobRecord>;
  updatePublishJob(id: string, patch: UpdatePublishJobInput): Promise<PublishJobRecord>;
}

export interface IAnalyticsRepository {
  getLatestWeeklyEvaluation(): Promise<WeeklyEvaluationReport>;
}

export interface UpsertAffiliateLinkInput {
  productId: string;
  lnkBioId: string | null;
  biolinkNumber: string;
  redirectCode: string;
  title: string;
  targetUrl: string;
  trackedUrl: string;
  imageUrl?: string | null;
  groupId?: string | null;
  groupName?: string | null;
  position: number;
  scheduleFrom?: string | null;
  scheduleTo?: string | null;
  syncStatus: LnkBioSyncStatus;
  isActive: boolean;
  lnkBioClicks?: number;
  lastSyncedAt?: string | null;
}

export interface CreateLnkBioSyncLogInput {
  productId: string | null;
  affiliateLinkId: string | null;
  operation: LnkBioSyncOperation;
  status: 'SUCCESS' | 'FAILED';
  httpStatus: number | null;
  requestPayload: Record<string, unknown> | null;
  responsePayload: Record<string, unknown> | null;
  errorMessage: string | null;
  attemptCount: number;
  durationMs: number | null;
}

export interface CreateLnkBioMetricsSnapshotInput {
  productId: string;
  affiliateLinkId: string | null;
  lnkBioId: string | null;
  snapshotDate: string;
  lnkBioClicks: number;
  internalRedirectClicks: number;
  totalTrackedClicks: number;
  ctrPct: number;
  estimatedCommissionIdr: number;
  performanceScore: number;
  utmBreakdown: Record<string, number> | null;
}

export interface ILnkBioRepository {
  listAffiliateLinks(): Promise<AffiliateLink[]>;
  getAffiliateLinkByProductId(productId: string): Promise<AffiliateLink | null>;
  getAffiliateLinkByRedirectCode(code: string): Promise<AffiliateLink | null>;
  upsertAffiliateLink(input: UpsertAffiliateLinkInput): Promise<AffiliateLink>;
  incrementInternalClicks(id: string): Promise<AffiliateLink>;
  updateAffiliateLinkClicks(
    id: string,
    patch: { lnkBioClicks?: number; position?: number; lastSyncedAt?: string }
  ): Promise<AffiliateLink>;
  markAffiliateLinkDeleted(productId: string): Promise<AffiliateLink | null>;
  listSyncLogs(filter?: {
    limit?: number;
    operation?: LnkBioSyncOperation;
    status?: 'SUCCESS' | 'FAILED';
  }): Promise<LnkBioSyncLog[]>;
  createSyncLog(input: CreateLnkBioSyncLogInput): Promise<LnkBioSyncLog>;
  listMetricsSnapshots(filter?: {
    productId?: string;
    limit?: number;
  }): Promise<LnkBioMetricsSnapshot[]>;
  createMetricsSnapshot(
    input: CreateLnkBioMetricsSnapshotInput
  ): Promise<LnkBioMetricsSnapshot>;
}

export interface CreateThreadsPostInput {
  productId: string;
  rootPostId: string | null;
  replyPostId: string | null;
  permalink: string | null;
  username: string;
  mediaType: ThreadsMediaType;
  rootText: string;
  replyText: string;
  mediaUrl: string | null;
  affiliateUrl: string;
  status: ThreadsPostStatus;
  errorMessage: string | null;
  publishedAt: string | null;
}

export interface CreateThreadsSyncLogInput {
  productId: string | null;
  threadsPostId: string | null;
  operation: ThreadsSyncOperation;
  status: 'SUCCESS' | 'FAILED';
  httpStatus: number | null;
  requestPayload: Record<string, unknown> | null;
  responsePayload: Record<string, unknown> | null;
  errorMessage: string | null;
  durationMs: number | null;
}

export interface IThreadsRepository {
  listPosts(filter?: { productId?: string; limit?: number }): Promise<ThreadsPostRecord[]>;
  createPost(input: CreateThreadsPostInput): Promise<ThreadsPostRecord>;
  listSyncLogs(filter?: {
    limit?: number;
    operation?: ThreadsSyncOperation;
    status?: 'SUCCESS' | 'FAILED';
  }): Promise<ThreadsSyncLog[]>;
  createSyncLog(input: CreateThreadsSyncLogInput): Promise<ThreadsSyncLog>;
}
