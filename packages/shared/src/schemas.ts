import { z } from 'zod';

// --- Enum Contracts ---
export const ProductStatusSchema = z.enum([
  'CANDIDATE',
  'CURATED',
  'ACTIVE',
  'PAUSED',
  'DROPPED',
]);

export const ContentStatusSchema = z.enum([
  'GENERATING_SCRIPT',
  'RENDERING_VIDEO',
  'PENDING_REVIEW',
  'APPROVED',
  'REJECTED',
  'FAILED',
]);

export const TargetPlatformSchema = z.enum([
  'IG_REELS',
  'FB_REELS',
  'YT_SHORTS',
  'SHOPEE_VIDEO',
  'TIKTOK_STUDIO',
  'THREADS',
]);

export const ExecutionModeSchema = z.enum(['OFFICIAL_API', 'PLAYWRIGHT_LOCAL']);

export const PublishStatusSchema = z.enum([
  'QUEUED',
  'PROCESSING',
  'PUBLISHED',
  'FAILED',
  'NEEDS_MANUAL_LOGIN',
  'CANCELLED',
]);

export const DmStatusSchema = z.enum([
  'PENDING',
  'SENT',
  'FAILED',
  'SKIPPED_NO_KEYWORD',
]);

export const DataSourceModeSchema = z.enum(['mock', 'real']);

// --- Product & Kalodata ---
export const AffiliateUrlsSchema = z.object({
  shopeeShortlink: z.string().url().optional(),
  tokopediaShortlink: z.string().url().optional(),
  tiktokProductId: z.string().min(1).optional(),
  tiktokShortlink: z.string().url().optional(),
  biolinkAnchorUrl: z.string().url().optional(),
  lnkBioId: z.string().min(1).optional(),
  lnkBioGroupId: z.string().min(1).optional(),
  lnkBioScheduleFrom: z.string().datetime({ offset: true }).optional(),
  lnkBioScheduleTo: z.string().datetime({ offset: true }).optional(),
  lnkBioPosition: z.number().int().nonnegative().optional(),
  threadsPostId: z.string().min(1).optional(),
  threadsReplyId: z.string().min(1).optional(),
  threadsPermalink: z.string().url().optional(),
});

export const KalodataCategorySchema = z.object({
  categoryId: z.string(),
  categoryName: z.string(),
});

export const KalodataVideoDetailSchema = z.object({
  videoId: z.string().min(1),
  videoTitle: z.string().optional(),
  belongedCreatorId: z.string().optional(),
  belongedCreatorHandle: z.string().optional(),
  videoUrl: z.string().url().optional(),
  revenue: z.number().optional(),
  views: z.number().int().nonnegative().optional(),
  revenueGrowthRate: z.number().optional(),
  adsRoas: z.number().optional(),
  diggCount: z.number().int().nonnegative().optional(),
  shareCount: z.number().int().nonnegative().optional(),
  commentCount: z.number().int().nonnegative().optional(),
  adRevenueRatio: z.number().optional(),
  adViewRatio: z.number().optional(),
  creatorDebut: z.string().optional(),
  ad: z.number().int().optional(),
  aiVideo: z.number().int().optional(),
  publishDate: z.string().optional(),
});

export const KalodataSnapshotSchema = z.object({
  imageUrl: z.string().url().optional(),
  weeklyRevenueIdr: z.number().nonnegative().optional(),
  weeklyUnitsSold: z.number().int().nonnegative().optional(),
  referenceVideoUrls: z.array(z.string().url()).default([]),
  syncedAt: z.string().datetime().optional(),
  unitPriceExactIdr: z.number().nonnegative().optional(),
  revenueExactIdr: z.number().nonnegative().optional(),
  revenueGrowthRatePct: z.number().optional(),
  liveRevenueIdr: z.number().nonnegative().optional(),
  videoRevenueIdr: z.number().nonnegative().optional(),
  showcaseRevenueIdr: z.number().nonnegative().optional(),
  launchDate: z.string().optional(),
  sellerId: z.string().optional(),
  sellerName: z.string().optional(),
  skuCount: z.string().optional(),
  priCategory: KalodataCategorySchema.optional(),
  secCategory: KalodataCategorySchema.optional(),
  terCategory: KalodataCategorySchema.optional(),
  referenceVideos: z.array(KalodataVideoDetailSchema).default([]),
});

export const KalodataCandidateSchema = z.object({
  kalodataProductId: z.string().min(1),
  name: z.string().min(3).max(255),
  niche: z.string().min(2).max(100),
  priceIdr: z.number().int().positive().max(1_000_000_000),
  rating: z.number().min(0).max(5),
  commissionRatePct: z.number().min(0).max(100),
  isCommissionXtra: z.boolean(),
  isOfficialStore: z.boolean(),
  imageUrl: z.string().url().optional(),
  weeklyRevenueIdr: z.number().nonnegative(),
  weeklyUnitsSold: z.number().int().nonnegative(),
  referenceVideoUrls: z.array(z.string().url()).default([]),
  unitPriceExactIdr: z.number().nonnegative().optional(),
  revenueExactIdr: z.number().nonnegative().optional(),
  revenueGrowthRatePct: z.number().optional(),
  liveRevenueIdr: z.number().nonnegative().optional(),
  videoRevenueIdr: z.number().nonnegative().optional(),
  showcaseRevenueIdr: z.number().nonnegative().optional(),
  launchDate: z.string().optional(),
  sellerId: z.string().optional(),
  sellerName: z.string().optional(),
  skuCount: z.string().optional(),
  priCategory: KalodataCategorySchema.optional(),
  secCategory: KalodataCategorySchema.optional(),
  terCategory: KalodataCategorySchema.optional(),
  referenceVideos: z.array(KalodataVideoDetailSchema).default([]),
});

export const ProductSchema = z.object({
  id: z.string().uuid(),
  kalodataProductId: z.string().nullable(),
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
  kalodataSnapshot: KalodataSnapshotSchema.nullable(),
  rawMediaDir: z.string().min(1),
  rawMediaClipCount: z.number().int().nonnegative(),
  status: ProductStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// --- Script Generator Output (LLM JSON) ---
export const SceneCueSchema = z.object({
  order: z.number().int().positive(),
  visualFocus: z.string().min(2),
  doodleText: z.string().max(80).optional(),
  durationSec: z.number().positive().max(15),
});

export const ScriptGeneratorOutputSchema = z.object({
  hook: z.string().min(5).max(160),
  scriptVoiceover: z.string().min(20).max(1200),
  captionSeo: z.string().min(10).max(2200),
  hashtags: z.array(z.string().regex(/^#[a-zA-Z0-9_]+$/)).min(1).max(15),
  pinnedComment: z.string().min(10).max(500),
  sceneCues: z.array(SceneCueSchema).min(2).max(10),
  storyboardPrompt: z.string().max(1000).optional(),
  storyboardImageUrl: z.string().min(1).optional(),
  productImageUrl: z.string().min(1).optional(),
  backgroundImageUrl: z.string().min(1).optional(),
});

// --- Content Asset ---
export const ContentAssetSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  llmProvider: z.string(),
  ttsProvider: z.enum(['edge-tts', 'elevenlabs']),
  ttsVoiceId: z.string(),
  scriptJson: ScriptGeneratorOutputSchema,
  audioR2Key: z.string().nullable(),
  subtitleR2Key: z.string().nullable(),
  videoR2Key: z.string().nullable(),
  videoSha256: z.string().length(64).nullable(),
  durationSec: z.number().positive().nullable(),
  resolution: z.literal('1080x1920'),
  status: ContentStatusSchema,
  rejectionReason: z.string().nullable(),
});

// --- Publish Job Record & BullMQ Payloads ---
export const PublishJobRecordSchema = z.object({
  id: z.string().uuid(),
  contentAssetId: z.string().uuid(),
  productId: z.string().uuid(),
  platform: TargetPlatformSchema,
  executionMode: ExecutionModeSchema,
  visibility: z.enum(['PUBLIC', 'PRIVATE']).default('PUBLIC'),
  scheduledAt: z.string().datetime(),
  publishedAt: z.string().datetime().nullable(),
  platformPostId: z.string().nullable(),
  status: PublishStatusSchema,
  attemptCount: z.number().int().nonnegative(),
  lastError: z.string().nullable(),
});

export const LocalVideoRenderJobSchema = z.object({
  contentAssetId: z.string().uuid(),
  productId: z.string().uuid(),
  rawMediaDir: z.string().min(1),
  productName: z.string().optional(),
  productImageUrl: z.string().min(1).optional(),
  storyboardImageUrl: z.string().min(1).optional(),
  referenceVideoUrls: z.array(z.string().url()).optional(),
  cleanupRawMediaAfterRender: z.boolean().optional(),
  scriptJson: ScriptGeneratorOutputSchema,
  ttsProvider: z.enum(['edge-tts', 'elevenlabs']),
  ttsVoiceId: z.string().min(1),
});

export const PublishJobPayloadSchema = z.object({
  publishJobId: z.string().uuid(),
  contentAssetId: z.string().uuid(),
  productId: z.string().uuid(),
  platform: TargetPlatformSchema,
  executionMode: ExecutionModeSchema,
  visibility: z.enum(['PUBLIC', 'PRIVATE']).default('PUBLIC'),
  videoR2Key: z.string().min(1),
  captionSeo: z.string().min(1),
  pinnedComment: z.string().min(1),
  productName: z.string().min(1),
  tiktokProductId: z.string().optional(),
});

// --- Meta Webhook Payload & DM Log ---
export const MetaCommentChangeValueSchema = z.object({
  id: z.string().min(1),
  text: z.string(),
  from: z.object({
    id: z.string().min(1),
    username: z.string().optional(),
  }),
  media: z
    .object({
      id: z.string().min(1),
      media_product_type: z.string().optional(),
    })
    .optional(),
});

export const MetaWebhookPayloadSchema = z.object({
  object: z.enum(['instagram', 'page']),
  entry: z.array(
    z.object({
      id: z.string(),
      time: z.number(),
      changes: z
        .array(
          z.object({
            field: z.string(),
            value: MetaCommentChangeValueSchema.passthrough(),
          })
        )
        .optional(),
    })
  ),
});

export const DmLogSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid().nullable(),
  platform: z.enum(['IG_REELS', 'FB_REELS']),
  mediaId: z.string().min(1),
  commentId: z.string().min(1),
  senderId: z.string().min(1),
  senderUsername: z.string().nullable(),
  commentText: z.string(),
  matchedKeyword: z.string().nullable(),
  publicReplySent: z.boolean(),
  dmSent: z.boolean(),
  status: DmStatusSchema,
  createdAt: z.string().datetime(),
});

// --- Weekly Evaluation Report ---
export const WeeklyRecommendationSchema = z.enum([
  'SCALE',
  'OPTIMIZE_HOOK',
  'DROP',
]);

export const WeeklyEvaluationReportSchema = z.object({
  weekStartDate: z.string().datetime(),
  generatedAt: z.string().datetime(),
  items: z.array(
    z.object({
      productId: z.string().uuid(),
      productName: z.string(),
      triggerKeyword: z.string(),
      videosPublished: z.number().int().nonnegative(),
      totalViews: z.number().int().nonnegative(),
      totalTriggerComments: z.number().int().nonnegative(),
      totalDmSent: z.number().int().nonnegative(),
      estimatedClicks: z.number().int().nonnegative(),
      estimatedCommissionIdr: z.number().int().nonnegative(),
      recommendation: WeeklyRecommendationSchema,
      operatorDecision: z.enum(['APPLIED', 'OVERRIDDEN', 'PENDING']).nullable(),
    })
  ),
});

// --- Lnk.Bio Automation & Hybrid Analytics ---
export const LnkBioSyncOperationSchema = z.enum([
  'ADD',
  'EDIT',
  'DELETE',
  'REORDER',
  'LIST_SYNC',
  'ME_SYNC',
  'AUTH_TOKEN',
]);

export const LnkBioSyncStatusSchema = z.enum([
  'SYNCED',
  'PENDING',
  'FAILED',
  'DELETED',
]);

export const LnkBioGroupSchema = z.object({
  groupId: z.string().min(1),
  groupName: z.string().min(1),
  linkCount: z.number().int().nonnegative().default(0),
});

export const LnkBioAccountProfileSchema = z.object({
  accountId: z.string().min(1),
  username: z.string().min(1),
  planTier: z.enum(['FREE', 'MINI', 'PRO', 'UNIQUE', 'UNKNOWN']).default('UNKNOWN'),
  supportsGroups: z.boolean(),
  connected: z.boolean(),
  tokenStatus: z.enum(['HEALTHY', 'EXPIRING_SOON', 'NEEDS_REAUTH', 'MOCK']),
  expiresAt: z.string().datetime().nullable(),
});

export const AffiliateLinkSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  lnkBioId: z.string().nullable(),
  biolinkNumber: z.string().min(1).max(16),
  redirectCode: z.string().min(3).max(32),
  title: z.string().min(1).max(255),
  targetUrl: z.string().url(),
  trackedUrl: z.string().url(),
  imageUrl: z.string().url().nullable(),
  groupId: z.string().nullable(),
  groupName: z.string().nullable(),
  position: z.number().int().nonnegative(),
  scheduleFrom: z.string().datetime({ offset: true }).nullable(),
  scheduleTo: z.string().datetime({ offset: true }).nullable(),
  syncStatus: LnkBioSyncStatusSchema,
  isActive: z.boolean(),
  internalClicks: z.number().int().nonnegative(),
  lnkBioClicks: z.number().int().nonnegative(),
  lastSyncedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  productStatus: ProductStatusSchema.optional(),
  readyForDelete: z.boolean().optional(),
  performanceScore: z.number().nonnegative().optional(),
});

export const LnkBioSyncLogSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid().nullable(),
  affiliateLinkId: z.string().uuid().nullable(),
  operation: LnkBioSyncOperationSchema,
  status: z.enum(['SUCCESS', 'FAILED']),
  httpStatus: z.number().int().nullable(),
  requestPayload: z.record(z.unknown()).nullable(),
  responsePayload: z.record(z.unknown()).nullable(),
  errorMessage: z.string().nullable(),
  attemptCount: z.number().int().positive(),
  durationMs: z.number().int().nonnegative().nullable(),
  createdAt: z.string().datetime(),
});

export const LnkBioMetricsSnapshotSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  affiliateLinkId: z.string().uuid().nullable(),
  lnkBioId: z.string().nullable(),
  snapshotDate: z.string().datetime(),
  lnkBioClicks: z.number().int().nonnegative(),
  internalRedirectClicks: z.number().int().nonnegative(),
  totalTrackedClicks: z.number().int().nonnegative(),
  ctrPct: z.number().nonnegative(),
  estimatedCommissionIdr: z.number().int().nonnegative(),
  performanceScore: z.number().nonnegative(),
  utmBreakdown: z.record(z.number().int().nonnegative()).nullable(),
  createdAt: z.string().datetime(),
});

export const LnkBioOverviewSchema = z.object({
  profile: LnkBioAccountProfileSchema,
  groups: z.array(LnkBioGroupSchema),
  links: z.array(AffiliateLinkSchema),
  recommendedOrder: z.array(z.string().uuid()),
  readyToDeleteCount: z.number().int().nonnegative(),
});

// --- Threads Automation ---
export const ThreadsMediaTypeSchema = z.enum(['TEXT', 'IMAGE', 'VIDEO']);

export const ThreadsPostStatusSchema = z.enum([
  'PUBLISHED',
  'PARTIAL_ROOT_ONLY',
  'FAILED',
]);

export const ThreadsSyncOperationSchema = z.enum([
  'AUTH_CODE',
  'AUTH_APP',
  'AUTH_TOKEN',
  'PUBLISH_CHAIN',
  'DELETE_POST',
  'SYNC_PROFILE',
]);

export const ThreadsTokenTypeSchema = z.enum([
  'USER_TOKEN',
  'APP_TOKEN',
  'NEEDS_REAUTH',
  'MOCK',
]);

export const ThreadsAccountProfileSchema = z.object({
  appId: z.string(),
  userId: z.string().nullable(),
  username: z.string().min(1),
  displayName: z.string().min(1),
  connected: z.boolean(),
  hasUserToken: z.boolean(),
  hasAppToken: z.boolean(),
  tokenStatus: ThreadsTokenTypeSchema,
  expiresAt: z.string().datetime().nullable(),
});

export const ThreadsPostRecordSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  rootPostId: z.string().nullable(),
  replyPostId: z.string().nullable(),
  permalink: z.string().url().nullable(),
  username: z.string().min(1),
  mediaType: ThreadsMediaTypeSchema,
  rootText: z.string().min(1),
  replyText: z.string().min(1),
  mediaUrl: z.string().url().nullable(),
  affiliateUrl: z.string().url(),
  status: ThreadsPostStatusSchema,
  viewsCount: z.number().int().nonnegative(),
  likesCount: z.number().int().nonnegative(),
  repliesCount: z.number().int().nonnegative(),
  errorMessage: z.string().nullable(),
  publishedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const ThreadsSyncLogSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid().nullable(),
  threadsPostId: z.string().uuid().nullable(),
  operation: ThreadsSyncOperationSchema,
  status: z.enum(['SUCCESS', 'FAILED']),
  httpStatus: z.number().int().nullable(),
  requestPayload: z.record(z.unknown()).nullable(),
  responsePayload: z.record(z.unknown()).nullable(),
  errorMessage: z.string().nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  createdAt: z.string().datetime(),
});

export const ThreadsOverviewSchema = z.object({
  profile: ThreadsAccountProfileSchema,
  posts: z.array(ThreadsPostRecordSchema),
  logs: z.array(ThreadsSyncLogSchema),
});
