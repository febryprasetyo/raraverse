import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  integer,
  numeric,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';

// --- ENUMS ---
export const productStatusEnum = pgEnum('product_status', [
  'CANDIDATE',
  'CURATED',
  'ACTIVE',
  'PAUSED',
  'DROPPED',
]);

export const contentStatusEnum = pgEnum('content_status', [
  'GENERATING_SCRIPT',
  'RENDERING_VIDEO',
  'PENDING_REVIEW',
  'APPROVED',
  'REJECTED',
  'FAILED',
]);

export const platformEnum = pgEnum('target_platform', [
  'IG_REELS',
  'FB_REELS',
  'YT_SHORTS',
  'SHOPEE_VIDEO',
  'TIKTOK_STUDIO',
  'THREADS',
]);

export const executionModeEnum = pgEnum('execution_mode', [
  'OFFICIAL_API',
  'PLAYWRIGHT_LOCAL',
]);

export const publishStatusEnum = pgEnum('publish_status', [
  'QUEUED',
  'PROCESSING',
  'PUBLISHED',
  'FAILED',
  'NEEDS_MANUAL_LOGIN',
  'CANCELLED',
]);

export const dmStatusEnum = pgEnum('dm_status', [
  'PENDING',
  'SENT',
  'FAILED',
  'SKIPPED_NO_KEYWORD',
]);

// --- 1. TABEL PRODUCTS ---
export const products = pgTable(
  'products',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    kalodataProductId: varchar('kalodata_product_id', { length: 128 }),
    niche: varchar('niche', { length: 100 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    priceIdr: integer('price_idr').notNull(),
    rating: numeric('rating', { precision: 3, scale: 2 }).default('0.00').notNull(),
    commissionRatePct: numeric('commission_rate_pct', { precision: 5, scale: 2 })
      .default('0.00')
      .notNull(),
    isCommissionXtra: boolean('is_commission_xtra').default(false).notNull(),
    isOfficialStore: boolean('is_official_store').default(false).notNull(),
    biolinkNumber: varchar('biolink_number', { length: 16 }).notNull(),
    triggerKeyword: varchar('trigger_keyword', { length: 32 }).notNull(),
    affiliateUrls: jsonb('affiliate_urls')
      .$type<{
        shopeeShortlink?: string;
        tokopediaShortlink?: string;
        tiktokProductId?: string;
        tiktokShortlink?: string;
        biolinkAnchorUrl?: string;
        lnkBioId?: string;
        lnkBioGroupId?: string;
        lnkBioScheduleFrom?: string;
        lnkBioScheduleTo?: string;
        lnkBioPosition?: number;
        threadsPostId?: string;
        threadsReplyId?: string;
        threadsPermalink?: string;
      }>()
      .notNull(),
    kalodataSnapshot: jsonb('kalodata_snapshot').$type<{
      imageUrl?: string;
      weeklyRevenueIdr?: number;
      weeklyUnitsSold?: number;
      referenceVideoUrls?: string[];
      syncedAt?: string;
      unitPriceExactIdr?: number;
      revenueExactIdr?: number;
      revenueGrowthRatePct?: number;
      liveRevenueIdr?: number;
      videoRevenueIdr?: number;
      showcaseRevenueIdr?: number;
      launchDate?: string;
      sellerId?: string;
      sellerName?: string;
      skuCount?: string;
      priCategory?: { categoryId: string; categoryName: string };
      secCategory?: { categoryId: string; categoryName: string };
      terCategory?: { categoryId: string; categoryName: string };
      referenceVideos?: Array<{
        videoId: string;
        videoTitle?: string;
        belongedCreatorId?: string;
        belongedCreatorHandle?: string;
        videoUrl?: string;
        revenue?: number;
        views?: number;
        revenueGrowthRate?: number;
        adsRoas?: number;
        diggCount?: number;
        shareCount?: number;
        commentCount?: number;
        adRevenueRatio?: number;
        adViewRatio?: number;
        creatorDebut?: string;
        ad?: number;
        aiVideo?: number;
        publishDate?: string;
      }>;
    }>(),
    rawMediaDir: varchar('raw_media_dir', { length: 512 }).notNull(),
    rawMediaClipCount: integer('raw_media_clip_count').default(0).notNull(),
    status: productStatusEnum('status').default('CANDIDATE').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    triggerKeywordIdx: uniqueIndex('products_trigger_keyword_uq').on(
      table.triggerKeyword
    ),
    biolinkNumberIdx: uniqueIndex('products_biolink_number_uq').on(
      table.biolinkNumber
    ),
    kalodataIdIdx: uniqueIndex('products_kalodata_id_uq').on(
      table.kalodataProductId
    ),
    statusIdx: index('products_status_idx').on(table.status),
  })
);

// --- 2. TABEL CONTENT_ASSETS ---
export const contentAssets = pgTable(
  'content_assets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    llmProvider: varchar('llm_provider', { length: 64 }).notNull(),
    ttsProvider: varchar('tts_provider', { length: 64 }).notNull(),
    ttsVoiceId: varchar('tts_voice_id', { length: 64 }).notNull(),
    scriptJson: jsonb('script_json')
      .$type<{
        hook: string;
        scriptVoiceover: string;
        captionSeo: string;
        hashtags: string[];
        pinnedComment: string;
        sceneCues: Array<{
          order: number;
          visualFocus: string;
          doodleText?: string;
          durationSec: number;
        }>;
        storyboardPrompt?: string;
        storyboardImageUrl?: string;
        productImageUrl?: string;
        backgroundImageUrl?: string;
      }>()
      .notNull(),
    audioR2Key: varchar('audio_r2_key', { length: 512 }),
    subtitleR2Key: varchar('subtitle_r2_key', { length: 512 }),
    videoR2Key: varchar('video_r2_key', { length: 512 }),
    videoSha256: varchar('video_sha256', { length: 64 }),
    durationSec: numeric('duration_sec', { precision: 6, scale: 2 }),
    resolution: varchar('resolution', { length: 16 }).default('1080x1920').notNull(),
    status: contentStatusEnum('status').default('GENERATING_SCRIPT').notNull(),
    rejectionReason: text('rejection_reason'),
    approvedBy: varchar('approved_by', { length: 128 }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    productIdx: index('content_assets_product_idx').on(table.productId),
    statusIdx: index('content_assets_status_idx').on(table.status),
    videoShaIdx: uniqueIndex('content_assets_video_sha256_uq').on(table.videoSha256),
  })
);

// --- 3. TABEL PUBLISH_JOBS ---
export const publishJobs = pgTable(
  'publish_jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    contentAssetId: uuid('content_asset_id')
      .notNull()
      .references(() => contentAssets.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    platform: platformEnum('platform').notNull(),
    executionMode: executionModeEnum('execution_mode').notNull(),
    visibility: varchar('visibility', { length: 32 }).default('PUBLIC').notNull(),
    bullmqJobId: varchar('bullmq_job_id', { length: 128 }),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    platformPostId: varchar('platform_post_id', { length: 255 }),
    platformPostUrl: text('platform_post_url'),
    status: publishStatusEnum('status').default('QUEUED').notNull(),
    attemptCount: integer('attempt_count').default(0).notNull(),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    assetPlatformIdx: uniqueIndex('publish_jobs_asset_platform_uq').on(
      table.contentAssetId,
      table.platform
    ),
    statusScheduleIdx: index('publish_jobs_status_schedule_idx').on(
      table.status,
      table.scheduledAt
    ),
    platformPostIdx: index('publish_jobs_platform_post_idx').on(table.platformPostId),
  })
);

// --- 4. TABEL DM_LOGS ---
export const dmLogs = pgTable(
  'dm_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    productId: uuid('product_id').references(() => products.id, {
      onDelete: 'set null',
    }),
    platform: varchar('platform', { length: 32 }).notNull(),
    mediaId: varchar('media_id', { length: 128 }).notNull(),
    commentId: varchar('comment_id', { length: 128 }).notNull(),
    senderId: varchar('sender_id', { length: 128 }).notNull(),
    senderUsername: varchar('sender_username', { length: 128 }),
    commentText: text('comment_text').notNull(),
    matchedKeyword: varchar('matched_keyword', { length: 32 }),
    publicReplyText: text('public_reply_text'),
    publicReplySent: boolean('public_reply_sent').default(false).notNull(),
    dmSent: boolean('dm_sent').default(false).notNull(),
    sentShortlink: text('sent_shortlink'),
    status: dmStatusEnum('status').default('PENDING').notNull(),
    errorMessage: text('error_message'),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    commentIdUq: uniqueIndex('dm_logs_comment_id_uq').on(table.commentId),
    keywordCreatedIdx: index('dm_logs_keyword_created_idx').on(
      table.matchedKeyword,
      table.createdAt
    ),
  })
);

// --- 5. TABEL OAUTH_TOKENS ---
export const oauthTokens = pgTable(
  'oauth_tokens',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    provider: varchar('provider', { length: 32 }).notNull(),
    accountLabel: varchar('account_label', { length: 128 }).notNull(),
    externalAccountId: varchar('external_account_id', { length: 128 }).notNull(),
    encryptedAccessToken: text('encrypted_access_token').notNull(),
    encryptedRefreshToken: text('encrypted_refresh_token'),
    tokenIv: varchar('token_iv', { length: 64 }).notNull(),
    tokenAuthTag: varchar('token_auth_tag', { length: 64 }).notNull(),
    scopes: text('scopes').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastRefreshedAt: timestamp('last_refreshed_at', { withTimezone: true }),
    needsReauth: boolean('needs_reauth').default(false).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    providerAccountUq: uniqueIndex('oauth_tokens_provider_account_uq').on(
      table.provider,
      table.externalAccountId
    ),
  })
);

// --- 6. TABEL PRODUCT_METRICS_WEEKLY ---
export const productMetricsWeekly = pgTable(
  'product_metrics_weekly',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    weekStartDate: timestamp('week_start_date', { withTimezone: true }).notNull(),
    videosPublished: integer('videos_published').default(0).notNull(),
    totalViews: integer('total_views').default(0).notNull(),
    totalTriggerComments: integer('total_trigger_comments').default(0).notNull(),
    totalDmSent: integer('total_dm_sent').default(0).notNull(),
    estimatedClicks: integer('estimated_clicks').default(0).notNull(),
    estimatedCommissionIdr: integer('estimated_commission_idr').default(0).notNull(),
    recommendation: varchar('recommendation', { length: 32 }).notNull(),
    operatorDecision: varchar('operator_decision', { length: 32 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    productWeekUq: uniqueIndex('product_metrics_weekly_prod_week_uq').on(
      table.productId,
      table.weekStartDate
    ),
  })
);

// --- 7. TABEL AFFILIATE_LINKS (Lnk.Bio Master & Hybrid Redirect Mapping) ---
export const affiliateLinks = pgTable(
  'affiliate_links',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    lnkBioId: varchar('lnk_bio_id', { length: 128 }),
    biolinkNumber: varchar('biolink_number', { length: 16 }).notNull(),
    redirectCode: varchar('redirect_code', { length: 32 }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    targetUrl: text('target_url').notNull(),
    trackedUrl: text('tracked_url').notNull(),
    imageUrl: text('image_url'),
    groupId: varchar('group_id', { length: 128 }),
    groupName: varchar('group_name', { length: 128 }),
    position: integer('position').default(0).notNull(),
    scheduleFrom: timestamp('schedule_from', { withTimezone: true }),
    scheduleTo: timestamp('schedule_to', { withTimezone: true }),
    syncStatus: varchar('sync_status', { length: 32 }).default('PENDING').notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    internalClicks: integer('internal_clicks').default(0).notNull(),
    lnkBioClicks: integer('lnk_bio_clicks').default(0).notNull(),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    productUq: uniqueIndex('affiliate_links_product_uq').on(table.productId),
    redirectCodeUq: uniqueIndex('affiliate_links_redirect_code_uq').on(
      table.redirectCode
    ),
    lnkBioIdIdx: index('affiliate_links_lnkbio_id_idx').on(table.lnkBioId),
  })
);

// --- 8. TABEL LNK_BIO_SYNC_LOGS ---
export const lnkBioSyncLogs = pgTable(
  'lnk_bio_sync_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    productId: uuid('product_id').references(() => products.id, {
      onDelete: 'set null',
    }),
    affiliateLinkId: uuid('affiliate_link_id').references(() => affiliateLinks.id, {
      onDelete: 'set null',
    }),
    operation: varchar('operation', { length: 32 }).notNull(),
    status: varchar('status', { length: 16 }).notNull(),
    httpStatus: integer('http_status'),
    requestPayload: jsonb('request_payload').$type<Record<string, unknown> | null>(),
    responsePayload: jsonb('response_payload').$type<Record<string, unknown> | null>(),
    errorMessage: text('error_message'),
    attemptCount: integer('attempt_count').default(1).notNull(),
    durationMs: integer('duration_ms'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    operationCreatedIdx: index('lnk_bio_sync_logs_op_created_idx').on(
      table.operation,
      table.createdAt
    ),
    productIdx: index('lnk_bio_sync_logs_product_idx').on(table.productId),
  })
);

// --- 9. TABEL LNK_BIO_METRICS_SNAPSHOTS ---
export const lnkBioMetricsSnapshots = pgTable(
  'lnk_bio_metrics_snapshots',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    affiliateLinkId: uuid('affiliate_link_id').references(() => affiliateLinks.id, {
      onDelete: 'set null',
    }),
    lnkBioId: varchar('lnk_bio_id', { length: 128 }),
    snapshotDate: timestamp('snapshot_date', { withTimezone: true }).notNull(),
    lnkBioClicks: integer('lnk_bio_clicks').default(0).notNull(),
    internalRedirectClicks: integer('internal_redirect_clicks').default(0).notNull(),
    totalTrackedClicks: integer('total_tracked_clicks').default(0).notNull(),
    ctrPct: numeric('ctr_pct', { precision: 6, scale: 2 }).default('0.00').notNull(),
    estimatedCommissionIdr: integer('estimated_commission_idr').default(0).notNull(),
    performanceScore: numeric('performance_score', { precision: 10, scale: 2 })
      .default('0.00')
      .notNull(),
    utmBreakdown: jsonb('utm_breakdown').$type<Record<string, number> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    productSnapshotIdx: index('lnk_bio_metrics_snapshots_prod_date_idx').on(
      table.productId,
      table.snapshotDate
    ),
  })
);

// --- 10. TABEL THREADS_POSTS (Chained Thread Affiliate History) ---
export const threadsPosts = pgTable(
  'threads_posts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    rootPostId: varchar('root_post_id', { length: 128 }),
    replyPostId: varchar('reply_post_id', { length: 128 }),
    permalink: text('permalink'),
    username: varchar('username', { length: 128 }).notNull(),
    mediaType: varchar('media_type', { length: 16 }).default('TEXT').notNull(),
    rootText: text('root_text').notNull(),
    replyText: text('reply_text').notNull(),
    mediaUrl: text('media_url'),
    affiliateUrl: text('affiliate_url').notNull(),
    status: varchar('status', { length: 32 }).default('PUBLISHED').notNull(),
    viewsCount: integer('views_count').default(0).notNull(),
    likesCount: integer('likes_count').default(0).notNull(),
    repliesCount: integer('replies_count').default(0).notNull(),
    errorMessage: text('error_message'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    productIdx: index('threads_posts_product_idx').on(table.productId),
    rootPostIdx: index('threads_posts_root_post_idx').on(table.rootPostId),
    statusIdx: index('threads_posts_status_idx').on(table.status),
  })
);

// --- 11. TABEL THREADS_SYNC_LOGS ---
export const threadsSyncLogs = pgTable(
  'threads_sync_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    productId: uuid('product_id').references(() => products.id, {
      onDelete: 'set null',
    }),
    threadsPostId: uuid('threads_post_id').references(() => threadsPosts.id, {
      onDelete: 'set null',
    }),
    operation: varchar('operation', { length: 32 }).notNull(),
    status: varchar('status', { length: 16 }).notNull(),
    httpStatus: integer('http_status'),
    requestPayload: jsonb('request_payload').$type<Record<string, unknown> | null>(),
    responsePayload: jsonb('response_payload').$type<Record<string, unknown> | null>(),
    errorMessage: text('error_message'),
    durationMs: integer('duration_ms'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    operationCreatedIdx: index('threads_sync_logs_op_created_idx').on(
      table.operation,
      table.createdAt
    ),
    productIdx: index('threads_sync_logs_product_idx').on(table.productId),
  })
);
