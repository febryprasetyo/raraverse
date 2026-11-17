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
} from '../index.js';

describe('@ebieshop/shared Zod schemas', () => {
  it('validates a curated product with triggerKeyword RAK01 and price <= 100000', () => {
    const result = ProductSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      kalodataProductId: 'kd_12345',
      niche: 'perlengkapan_dapur',
      name: 'Rak Bumbu Dapur 2 Tingkat Baja Karbon',
      priceIdr: 49900,
      rating: 4.9,
      commissionRatePct: 12.5,
      isCommissionXtra: true,
      isOfficialStore: true,
      biolinkNumber: '001',
      triggerKeyword: 'RAK01',
      affiliateUrls: {
        shopeeShortlink: 'https://shope.ee/example01',
        biolinkAnchorUrl: 'https://desty.page/ebieshop#001',
      },
      kalodataSnapshot: {
        weeklyRevenueIdr: 15000000,
        weeklyUnitsSold: 300,
        referenceVideoUrls: ['https://example.com/ref-1.mp4'],
        syncedAt: '2026-11-16T08:00:00.000Z',
      },
      rawMediaDir: 'raw_media_dir/550e8400-e29b-41d4-a716-446655440000',
      rawMediaClipCount: 4,
      status: 'ACTIVE',
      createdAt: '2026-11-16T08:00:00.000Z',
      updatedAt: '2026-11-16T08:00:00.000Z',
    });

    expect(result.success).toBe(true);
  });

  it('rejects product above Rp100.000 or invalid triggerKeyword', () => {
    const result = ProductSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      kalodataProductId: null,
      niche: 'dapur',
      name: 'Produk Mahal',
      priceIdr: 150000,
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
});
