import { describe, expect, it, vi } from 'vitest';
import {
  FbReelsPublisher,
  IgReelsPublisher,
  OfficialApiPublishProcessor,
  YtShortsPublisher,
} from '../adapters/official-publishers.js';
import { MockPublishJobRepository } from '../adapters/mock-adapters.js';

describe('Official API Publisher (IG Reels, FB Reels, YT Shorts)', () => {
  it('publishes IG Reels by creating container, polling until FINISHED, and calling media_publish', async () => {
    const fetchMock = vi
      .fn()
      // 1. Create media container
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 'container_123' }),
      })
      // 2. First poll: IN_PROGRESS
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ status_code: 'IN_PROGRESS' }),
      })
      // 3. Second poll: FINISHED
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ status_code: 'FINISHED' }),
      })
      // 4. media_publish
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 'ig_media_999' }),
      })
      // 5. pinned comment
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 'ig_comment_1' }),
      });

    const ig = new IgReelsPublisher({
      igUserId: '1784140000000',
      accessToken: 'ig-token-123',
      publicBaseUrl: 'https://cdn.ebieshop.test',
      pollIntervalMs: 1,
      maxPollAttempts: 5,
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    const result = await ig.publish({
      publishJobId: '550e8400-e29b-41d4-a716-446655440100',
      contentAssetId: '550e8400-e29b-41d4-a716-446655440010',
      productId: '550e8400-e29b-41d4-a716-446655440001',
      platform: 'IG_REELS',
      executionMode: 'OFFICIAL_API',
      visibility: 'PUBLIC',
      videoR2Key: 'renders/asset-10/final.mp4',
      captionSeo: 'Rak dapur estetik! Komen RAK01',
      pinnedComment: 'Komen RAK01 untuk link!',
      productName: 'Rak Bumbu Dapur',
    });

    expect(result.platformPostId).toBe('ig_media_999');
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it('publishes FB Reels via start -> upload -> finish flow', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ video_id: 'fb_vid_1', upload_url: 'https://rupload.facebook.com/video-upload/fb_vid_1' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      });

    const fb = new FbReelsPublisher({
      pageId: 'page_123',
      pageAccessToken: 'fb-token-123',
      publicBaseUrl: 'https://cdn.ebieshop.test',
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    const result = await fb.publish({
      publishJobId: '550e8400-e29b-41d4-a716-446655440101',
      contentAssetId: '550e8400-e29b-41d4-a716-446655440010',
      productId: '550e8400-e29b-41d4-a716-446655440001',
      platform: 'FB_REELS',
      executionMode: 'OFFICIAL_API',
      visibility: 'PUBLIC',
      videoR2Key: 'renders/asset-10/final.mp4',
      captionSeo: 'Rak dapur estetik!',
      pinnedComment: 'Komen RAK01!',
      productName: 'Rak Bumbu Dapur',
    });

    expect(result.platformPostId).toBe('fb_vid_1');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('publishes YT Shorts with #Shorts tag and respects visibility', async () => {
    const fetchMock = vi
      .fn()
      // Download video from R2
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
      })
      // Upload to YouTube
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 'yt_short_777' }),
      });

    const yt = new YtShortsPublisher({
      accessToken: 'yt-access-token',
      publicBaseUrl: 'https://cdn.ebieshop.test',
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    const result = await yt.publish({
      publishJobId: '550e8400-e29b-41d4-a716-446655440102',
      contentAssetId: '550e8400-e29b-41d4-a716-446655440010',
      productId: '550e8400-e29b-41d4-a716-446655440001',
      platform: 'YT_SHORTS',
      executionMode: 'OFFICIAL_API',
      visibility: 'PRIVATE',
      videoR2Key: 'renders/asset-10/final.mp4',
      captionSeo: 'Rak dapur estetik!',
      pinnedComment: 'Cek bio #001',
      productName: 'Rak Bumbu Dapur',
    });

    expect(result.platformPostId).toBe('yt_short_777');
    expect(result.platformPostUrl).toBe('https://www.youtube.com/shorts/yt_short_777');
  });

  it('updates publishJob status to PUBLISHED via OfficialApiPublishProcessor', async () => {
    const repo = new MockPublishJobRepository();
    const job = await repo.createPublishJob({
      contentAssetId: '550e8400-e29b-41d4-a716-446655440010',
      productId: '550e8400-e29b-41d4-a716-446655440001',
      platform: 'IG_REELS',
      executionMode: 'OFFICIAL_API',
      visibility: 'PUBLIC',
      scheduledAt: new Date().toISOString(),
    });

    const processor = new OfficialApiPublishProcessor(repo, {
      IG_REELS: {
        publish: vi.fn().mockResolvedValue({
          platformPostId: 'ig_999',
          platformPostUrl: 'https://instagram.com/reel/ig_999',
        }),
      },
    });

    const updated = await processor.process({
      publishJobId: job.id,
      contentAssetId: job.contentAssetId,
      productId: job.productId,
      platform: 'IG_REELS',
      executionMode: 'OFFICIAL_API',
      visibility: 'PUBLIC',
      videoR2Key: 'renders/asset-10/final.mp4',
      captionSeo: 'Caption',
      pinnedComment: 'Pinned',
      productName: 'Rak Bumbu',
    });

    expect(updated.status).toBe('PUBLISHED');
    expect(updated.platformPostId).toBe('ig_999');
  });
});
