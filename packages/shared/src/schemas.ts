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
});

export const KalodataSnapshotSchema = z.object({
  weeklyRevenueIdr: z.number().nonnegative().optional(),
  weeklyUnitsSold: z.number().int().nonnegative().optional(),
  referenceVideoUrls: z.array(z.string().url()).default([]),
  syncedAt: z.string().datetime().optional(),
});

export const KalodataCandidateSchema = z.object({
  kalodataProductId: z.string().min(1),
  name: z.string().min(3).max(255),
  niche: z.string().min(2).max(100),
  priceIdr: z.number().int().positive().max(100000),
  rating: z.number().min(0).max(5),
  commissionRatePct: z.number().min(0).max(100),
  isCommissionXtra: z.boolean(),
  isOfficialStore: z.boolean(),
  weeklyRevenueIdr: z.number().nonnegative(),
  weeklyUnitsSold: z.number().int().nonnegative(),
  referenceVideoUrls: z.array(z.string().url()).default([]),
});

export const ProductSchema = z.object({
  id: z.string().uuid(),
  kalodataProductId: z.string().nullable(),
  niche: z.string().min(2).max(100),
  name: z.string().min(3).max(255),
  priceIdr: z.number().int().positive().max(100000),
  rating: z.number().min(0).max(5),
  commissionRatePct: z.number().min(0).max(100),
  isCommissionXtra: z.boolean(),
  isOfficialStore: z.boolean(),
  biolinkNumber: z.string().regex(/^\d{3,4}$/),
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
  durationSec: z.number().positive().max(15),
});

export const ScriptGeneratorOutputSchema = z.object({
  hook: z.string().min(5).max(160),
  scriptVoiceover: z.string().min(20).max(1200),
  captionSeo: z.string().min(10).max(2200),
  hashtags: z.array(z.string().regex(/^#[a-zA-Z0-9_]+$/)).min(1).max(15),
  pinnedComment: z.string().min(10).max(500),
  sceneCues: z.array(SceneCueSchema).min(2).max(10),
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
