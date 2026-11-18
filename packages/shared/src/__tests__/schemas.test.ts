import { describe, it, expect } from 'vitest';
import {
  ProductSchema,
  ScriptGeneratorOutputSchema,
  MetaWebhookPayloadSchema,
  WeeklyEvaluationReportSchema,
  KalodataCandidateSchema,
  ContentAssetSchema,
  PublishJobRecordSchema,
  DmLogSchema,
  AffiliateLinkSchema,
  LnkBioSyncLogSchema,
  LnkBioMetricsSnapshotSchema,
  LnkBioGroupSchema,
  LnkBioAccountProfileSchema,
  TargetPlatformSchema,
  ThreadsAccountProfileSchema,
  ThreadsPostRecordSchema,
  ThreadsSyncLogSchema,
  ThreadsOverviewSchema,
} from '../index.js';

describe('@ebieshop/shared Zod schemas', () => {
  it('validates a curated product with full Kalodata fields and price above Rp100.000', () => {
    const result = ProductSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      kalodataProductId: '1736805940517045607',
      niche: 'skincare',
      name: 'Complete Package - Puragen hybright-XT | Daviena Skincare',
      priceIdr: 425778,
      rating: 4.9,
      commissionRatePct: 5,
      isCommissionXtra: false,
      isOfficialStore: true,
      biolinkNumber: '001',
      triggerKeyword: 'DAV01',
      affiliateUrls: {
        shopeeShortlink: 'https://shope.ee/example01',
        biolinkAnchorUrl: 'https://desty.page/ebieshop#001',
      },
      kalodataSnapshot: {
        imageUrl: 'https://example.com/product.jpg',
        weeklyRevenueIdr: 1453604477,
        weeklyUnitsSold: 3414,
        unitPriceExactIdr: 425777.53,
        revenueExactIdr: 1453604476.86,
        revenueGrowthRatePct: 30.3,
        liveRevenueIdr: 396481823.62,
        videoRevenueIdr: 1057122653.23,
        showcaseRevenueIdr: 0,
        launchDate: '2026-08-01',
        sellerId: '7494502404387277159',
        sellerName: 'Daviena Skincare Official',
        skuCount: '3',
        priCategory: { categoryId: '601450', categoryName: 'Perawatan & Kecantikan' },
        secCategory: { categoryId: '848776', categoryName: 'Skincare' },
        terCategory: { categoryId: '601611', categoryName: 'Kit Perawatan Kulit' },
        referenceVideoUrls: ['https://www.tiktok.com/@creator/video/7685958821180624135'],
        referenceVideos: [
          {
            videoId: '7685958821180624135',
            videoTitle: 'Review skincare glowing',
            belongedCreatorId: '7220799642455114778',
            belongedCreatorHandle: 'creator',
            videoUrl: 'https://www.tiktok.com/@creator/video/7685958821180624135',
            revenue: 229871437.91,
            views: 615198,
            revenueGrowthRate: -0.13,
            adsRoas: 2.85,
            diggCount: 8463,
            shareCount: 651,
            commentCount: 991,
            adRevenueRatio: 80,
            adViewRatio: 97.75,
            creatorDebut: '2025-03-27',
            ad: 1,
            aiVideo: 0,
            publishDate: '2026/09/16 09:45:44',
          },
        ],
        syncedAt: '2026-11-18T08:00:00.000Z',
      },
      rawMediaDir: 'raw_media_dir/550e8400-e29b-41d4-a716-446655440000',
      rawMediaClipCount: 4,
      status: 'ACTIVE',
      createdAt: '2026-11-16T08:00:00.000Z',
      updatedAt: '2026-11-16T08:00:00.000Z',
    });

    expect(result.success).toBe(true);
  });

  it('rejects product with non-positive priceIdr or invalid triggerKeyword', () => {
    const result = ProductSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      kalodataProductId: null,
      niche: 'dapur',
      name: 'Produk Tidak Valid',
      priceIdr: -5000,
      rating: 4.8,
      commissionRatePct: 10,
      isCommissionXtra: true,
      isOfficialStore: false,
      biolinkNumber: '001',
      triggerKeyword: 'rak-01', // lowercase & dash invalid
      affiliateUrls: {},
      kalodataSnapshot: null,
      rawMediaDir: 'raw_media_dir/test',
      rawMediaClipCount: 0,
      status: 'CANDIDATE',
      createdAt: '2026-11-16T08:00:00.000Z',
      updatedAt: '2026-11-16T08:00:00.000Z',
    });

    expect(result.success).toBe(false);
  });

  it('validates structured LLM ScriptGeneratorOutput JSON', () => {
    const result = ScriptGeneratorOutputSchema.safeParse({
      hook: 'Dapur sempit bikin sumpek? Cek rak lipat di bawah 50 ribu ini!',
      scriptVoiceover:
        'Sering kesal botol bumbu berantakan? Rak bumbu dua tingkat ini baja karbon anti karat. Komen RAK01 sekarang untuk link resmi di DM!',
      captionSeo: 'Solusi dapur estetik tanpa bor dinding! Komen RAK01 ya #rakdapur',
      hashtags: ['#rakdapur', '#dapurminimalis'],
      pinnedComment: 'Mau link promo? Komen RAK01 atau cek nomor #001 di bio!',
      sceneCues: [
        { order: 1, visualFocus: 'hook_problem', durationSec: 3.5 },
        { order: 2, visualFocus: 'cta_comment_keyword', durationSec: 4.5 },
      ],
    });

    expect(result.success).toBe(true);
  });

  it('validates MetaWebhookPayload, KalodataCandidate, ContentAsset, PublishJobRecord, DmLog, and WeeklyEvaluationReport', () => {
    expect(
      MetaWebhookPayloadSchema.safeParse({
        object: 'instagram',
        entry: [
          {
            id: '17841400000000000',
            time: 1763280000,
            changes: [
              {
                field: 'comments',
                value: {
                  id: '17999999999999999',
                  text: 'Mau dong kak RAK01',
                  from: { id: '24681012', username: 'pembeli_uji' },
                  media: { id: '18000000000000001', media_product_type: 'REELS' },
                },
              },
            ],
          },
        ],
      }).success
    ).toBe(true);

    expect(
      KalodataCandidateSchema.safeParse({
        kalodataProductId: 'kd_001',
        name: 'Rak Bumbu 2 Tingkat',
        niche: 'perlengkapan_dapur',
        priceIdr: 49900,
        rating: 4.9,
        commissionRatePct: 12.5,
        isCommissionXtra: true,
        isOfficialStore: true,
        weeklyRevenueIdr: 12000000,
        weeklyUnitsSold: 240,
        referenceVideoUrls: ['https://example.com/v1.mp4'],
      }).success
    ).toBe(true);

    expect(
      ContentAssetSchema.safeParse({
        id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
        productId: '550e8400-e29b-41d4-a716-446655440000',
        llmProvider: 'gemini-2.5-flash',
        ttsProvider: 'edge-tts',
        ttsVoiceId: 'id-ID-GadisNeural',
        scriptJson: {
          hook: 'Dapur sempit? Ini solusinya!',
          scriptVoiceover: 'Rak bumbu dua tingkat baja karbon anti karat. Komen RAK01 ya!',
          captionSeo: 'Rak dapur estetik #rakdapur',
          hashtags: ['#rakdapur'],
          pinnedComment: 'Komen RAK01 untuk link resmi!',
          sceneCues: [
            { order: 1, visualFocus: 'hook', durationSec: 3 },
            { order: 2, visualFocus: 'cta', durationSec: 4 },
          ],
        },
        audioR2Key: null,
        subtitleR2Key: null,
        videoR2Key: null,
        videoSha256: null,
        durationSec: null,
        resolution: '1080x1920',
        status: 'PENDING_REVIEW',
        rejectionReason: null,
      }).success
    ).toBe(true);

    expect(
      PublishJobRecordSchema.safeParse({
        id: '11111111-1111-4111-8111-111111111111',
        contentAssetId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
        productId: '550e8400-e29b-41d4-a716-446655440000',
        platform: 'IG_REELS',
        executionMode: 'OFFICIAL_API',
        visibility: 'PUBLIC',
        scheduledAt: '2026-11-17T12:30:00.000Z',
        publishedAt: null,
        platformPostId: null,
        status: 'QUEUED',
        attemptCount: 0,
        lastError: null,
      }).success
    ).toBe(true);

    expect(
      DmLogSchema.safeParse({
        id: '22222222-2222-4222-8222-222222222222',
        productId: '550e8400-e29b-41d4-a716-446655440000',
        platform: 'IG_REELS',
        mediaId: '18000000000000001',
        commentId: '17999999999999999',
        senderId: '24681012',
        senderUsername: 'pembeli_uji',
        commentText: 'Mau RAK01',
        matchedKeyword: 'RAK01',
        publicReplySent: true,
        dmSent: true,
        status: 'SENT',
        createdAt: '2026-11-16T08:05:00.000Z',
      }).success
    ).toBe(true);

    expect(
      WeeklyEvaluationReportSchema.safeParse({
        weekStartDate: '2026-11-09T00:00:00.000Z',
        generatedAt: '2026-11-15T13:00:00.000Z',
        items: [],
      }).success
    ).toBe(true);
  });

  it('validates Lnk.Bio automation schemas (AffiliateLink, SyncLog, MetricsSnapshot, Group, AccountProfile)', () => {
    expect(
      LnkBioGroupSchema.safeParse({
        groupId: 'grp_skincare_01',
        groupName: 'Skincare Pilihan',
        linkCount: 4,
      }).success
    ).toBe(true);

    expect(
      LnkBioAccountProfileSchema.safeParse({
        accountId: 'acc_123',
        username: 'ebieshop.id',
        planTier: 'MINI',
        supportsGroups: true,
        connected: true,
        tokenStatus: 'HEALTHY',
        expiresAt: '2026-12-18T00:00:00.000Z',
      }).success
    ).toBe(true);

    expect(
      AffiliateLinkSchema.safeParse({
        id: '33333333-3333-4333-8333-333333333333',
        productId: '550e8400-e29b-41d4-a716-446655440001',
        lnkBioId: '9823410',
        biolinkNumber: '001',
        redirectCode: 'RAK01',
        title: '#001 - Rak Bumbu Dapur 2 Tingkat',
        targetUrl: 'https://shope.ee/mock-rak01',
        trackedUrl: 'https://ebieshop.id/r/RAK01?utm_source=lnkbio&utm_medium=biolink&utm_campaign=RAK01',
        imageUrl: 'https://cdn.example.com/rak01.jpg',
        groupId: 'grp_dapur_01',
        groupName: 'Dapur Estetik',
        position: 1,
        scheduleFrom: '2026-11-18T00:00:00.000Z',
        scheduleTo: '2026-11-25T23:59:59.000Z',
        syncStatus: 'SYNCED',
        isActive: true,
        internalClicks: 142,
        lnkBioClicks: 110,
        lastSyncedAt: '2026-11-18T10:00:00.000Z',
        createdAt: '2026-11-18T08:00:00.000Z',
        updatedAt: '2026-11-18T10:00:00.000Z',
        productStatus: 'ACTIVE',
        readyForDelete: false,
        performanceScore: 1520,
      }).success
    ).toBe(true);

    expect(
      LnkBioSyncLogSchema.safeParse({
        id: '44444444-4444-4444-8444-444444444444',
        productId: '550e8400-e29b-41d4-a716-446655440001',
        affiliateLinkId: '33333333-3333-4333-8333-333333333333',
        operation: 'ADD',
        status: 'SUCCESS',
        httpStatus: 200,
        requestPayload: { title: '#001 - Rak Bumbu Dapur' },
        responsePayload: { status: true, lnk_id: '9823410' },
        errorMessage: null,
        attemptCount: 1,
        durationMs: 145,
        createdAt: '2026-11-18T08:00:00.000Z',
      }).success
    ).toBe(true);

    expect(
      LnkBioMetricsSnapshotSchema.safeParse({
        id: '55555555-5555-4555-8555-555555555555',
        productId: '550e8400-e29b-41d4-a716-446655440001',
        affiliateLinkId: '33333333-3333-4333-8333-333333333333',
        lnkBioId: '9823410',
        snapshotDate: '2026-11-18T10:00:00.000Z',
        lnkBioClicks: 110,
        internalRedirectClicks: 142,
        totalTrackedClicks: 142,
        ctrPct: 2.35,
        estimatedCommissionIdr: 185000,
        performanceScore: 1605,
        utmBreakdown: { lnkbio: 142 },
        createdAt: '2026-11-18T10:00:00.000Z',
      }).success
    ).toBe(true);
  });

  it('validates Threads automation schemas and THREADS target platform', () => {
    expect(TargetPlatformSchema.safeParse('THREADS').success).toBe(true);

    const profile = {
      appId: '1811443116804615',
      userId: '25000112233',
      username: 'raraverse',
      displayName: 'raraverse',
      connected: true,
      hasUserToken: true,
      hasAppToken: true,
      tokenStatus: 'USER_TOKEN',
      expiresAt: '2027-01-17T00:00:00.000Z',
    };
    expect(ThreadsAccountProfileSchema.safeParse(profile).success).toBe(true);

    const post = {
      id: '66666666-6666-4666-8666-666666666666',
      productId: '550e8400-e29b-41d4-a716-446655440001',
      rootPostId: '1799000111222333',
      replyPostId: '1799000111222444',
      permalink: 'https://www.threads.net/@raraverse/post/C_mock123',
      username: 'raraverse',
      mediaType: 'TEXT',
      rootText: 'Meja dapur sempit? Rak bumbu 2 tingkat ini bikin rapi seketika!',
      replyText: 'Link resmi produknya langsung cek di sini ya: https://shope.ee/mock-rak01',
      mediaUrl: null,
      affiliateUrl: 'https://shope.ee/mock-rak01',
      status: 'PUBLISHED',
      viewsCount: 120,
      likesCount: 14,
      repliesCount: 3,
      errorMessage: null,
      publishedAt: '2026-11-18T12:00:00.000Z',
      createdAt: '2026-11-18T12:00:00.000Z',
      updatedAt: '2026-11-18T12:00:00.000Z',
    };
    expect(ThreadsPostRecordSchema.safeParse(post).success).toBe(true);

    const log = {
      id: '77777777-7777-4777-8777-777777777777',
      productId: '550e8400-e29b-41d4-a716-446655440001',
      threadsPostId: '66666666-6666-4666-8666-666666666666',
      operation: 'PUBLISH_CHAIN',
      status: 'SUCCESS',
      httpStatus: 200,
      requestPayload: { mediaType: 'TEXT' },
      responsePayload: { rootPostId: '1799000111222333', replyPostId: '1799000111222444' },
      errorMessage: null,
      durationMs: 410,
      createdAt: '2026-11-18T12:00:00.000Z',
    };
    expect(ThreadsSyncLogSchema.safeParse(log).success).toBe(true);

    expect(
      ThreadsOverviewSchema.safeParse({
        profile,
        posts: [post],
        logs: [log],
      }).success
    ).toBe(true);
  });
});
