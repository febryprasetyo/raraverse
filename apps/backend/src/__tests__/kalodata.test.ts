import { describe, expect, it, vi } from 'vitest';
import { KalodataHttpClient } from '../adapters/kalodata-client.js';
import { AppError } from '../errors.js';

describe('KalodataHttpClient', () => {
  it('calls Kalodata OpenAPI product rank endpoint with secret-key, maps imageUrl, and enriches top reference videos', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: [
            {
              product_id: '1730659179602413069',
              product_name: 'Parutan Duduk Keripik Serbaguna Perlengkapan Dapur',
              unit_price: 28483.51,
              commission_rate: 8.5,
              revenue_growth_rate: 12.4,
              sales_volumn: 888,
              revenue: 25293353.33,
              live_revenue: 5293353.33,
              video_revenue: 19000000,
              showcase_revenue: 1000000,
              launch_date: '2026-06-15',
              seller_id: '7494000111222333',
              seller_name: 'Tosera Official Store',
              sku_count: '3',
              pri_category: { category_id: '600001', category_name: 'Perlengkapan Rumah' },
              sec_category: { category_id: '600101', category_name: 'Peralatan Dapur' },
              ter_category: { category_id: '600201', category_name: 'Parutan' },
              master_image_url:
                'https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/sample.jpeg',
            },
            {
              product_id: '1731356095806867262',
              product_name: 'Rak Piring Wastafel Mahal',
              unit_price: 270791.15,
              commission_rate: 5.0,
              sales_volumn: 784,
              revenue: 212300264.71,
              seller_name: 'Homedoki Store',
            },
            {
              product_id: 'kd_low_rating',
              product_name: 'Spatula Murah Rating Rendah',
              unit_price: 19000,
              rating: 4.3,
              commission_rate: 15,
              sales_volumn: 150,
              revenue: 3000000,
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: [
            {
              video_id: '7697937283219016980',
              video_title: 'Parutan anti capek #dapur',
              belonged_creator_id: '7100000000001',
              belonged_creator_handle: 'tokojatiwisesa96',
              revenue: 12000000.5,
              views: 312000,
              revenue_growth_rate: 0.35,
              ads_roas: 2.95,
              digg_count: 5400,
              share_count: 320,
              comment_count: 145,
              ad_revenue_ratio: 75.5,
              ad_view_ratio: 82.1,
              creator_debut: '2024-05-01',
              ad: 1,
              ai_video: 0,
              publish_date: '2026/11/10 14:00:00',
            },
            {
              video_id: '7701670497896910101',
              video_title: 'Review parutan serbaguna',
              belonged_creator_id: '7100000000002',
              belonged_creator_handle: '@darniewatie87',
              revenue: 7000000,
              views: 95000,
              revenue_growth_rate: -0.1,
              ads_roas: 0,
              digg_count: 1200,
              share_count: 45,
              comment_count: 28,
              ad_revenue_ratio: 0,
              ad_view_ratio: 0,
              creator_debut: '2025-01-10',
              ad: 0,
              ai_video: 1,
              publish_date: '2026/11/11 09:30:00',
            },
          ],
        }),
      });

    const client = new KalodataHttpClient({
      apiKey: 'test-kalodata-key',
      baseUrl: 'https://www.kalodata.com/openapi/v1',
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const results = await client.fetchWinningCandidates({
      niche: 'perlengkapan_dapur',
      maxPriceIdr: 99999,
      minRating: 4.8,
      limit: 10,
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    const [calledUrl, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe('https://www.kalodata.com/openapi/v1/tiktok/product/rank');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['secret-key']).toBe('test-kalodata-key');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/json;charset=utf-8'
    );

    const parsedBody = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(parsedBody).toMatchObject({
      region: 'ID',
      language: 'id-ID',
      currency: 'IDR',
      date_range: 'last7Day',
      keyword: 'perlengkapan dapur',
      is_affiliate: 1,
      need_image: 1,
      need_extra: true,
    });

    const [videoUrl, videoInit] = mockFetch.mock.calls[1] as [string, RequestInit];
    expect(videoUrl).toBe('https://www.kalodata.com/openapi/v1/tiktok/video/rank');
    expect(JSON.parse(videoInit.body as string)).toMatchObject({
      product_id: '1730659179602413069',
      page_size: 3,
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.kalodataProductId).toBe('1730659179602413069');
    expect(results[0]?.niche).toBe('perlengkapan_dapur');
    expect(results[0]?.priceIdr).toBe(28484);
    expect(results[0]?.rating).toBe(4.8);
    expect(results[0]?.commissionRatePct).toBe(8.5);
    expect(results[0]?.isCommissionXtra).toBe(true);
    expect(results[0]?.isOfficialStore).toBe(true);
    expect(results[0]?.imageUrl).toBe(
      'https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/sample.jpeg'
    );
    expect(results[0]?.weeklyUnitsSold).toBe(888);
    expect(results[0]?.weeklyRevenueIdr).toBe(25293353);
    expect(results[0]?.referenceVideoUrls).toEqual([
      'https://www.tiktok.com/@tokojatiwisesa96/video/7697937283219016980',
      'https://www.tiktok.com/@darniewatie87/video/7701670497896910101',
    ]);
    expect(results[0]?.unitPriceExactIdr).toBe(28483.51);
    expect(results[0]?.revenueExactIdr).toBe(25293353.33);
    expect(results[0]?.revenueGrowthRatePct).toBe(12.4);
    expect(results[0]?.liveRevenueIdr).toBe(5293353.33);
    expect(results[0]?.videoRevenueIdr).toBe(19000000);
    expect(results[0]?.showcaseRevenueIdr).toBe(1000000);
    expect(results[0]?.launchDate).toBe('2026-06-15');
    expect(results[0]?.sellerId).toBe('7494000111222333');
    expect(results[0]?.sellerName).toBe('Tosera Official Store');
    expect(results[0]?.skuCount).toBe('3');
    expect(results[0]?.priCategory).toEqual({
      categoryId: '600001',
      categoryName: 'Perlengkapan Rumah',
    });
    expect(results[0]?.referenceVideos).toHaveLength(2);
    expect(results[0]?.referenceVideos[0]).toMatchObject({
      videoId: '7697937283219016980',
      videoTitle: 'Parutan anti capek #dapur',
      belongedCreatorId: '7100000000001',
      belongedCreatorHandle: 'tokojatiwisesa96',
      revenue: 12000000.5,
      views: 312000,
      adsRoas: 2.95,
      diggCount: 5400,
      shareCount: 320,
      commentCount: 145,
      ad: 1,
      aiVideo: 0,
      publishDate: '2026/11/10 14:00:00',
    });
  });

  it('captures products above Rp100.000 and enriches videos for more than 5 products', async () => {
    const productsPayload = Array.from({ length: 6 }, (_, idx) => ({
      product_id: `173680594051704560${idx}`,
      product_name: `Skincare Paket Premium #${idx + 1}`,
      unit_price: 250000 + idx * 10000,
      commission_rate: 10,
      revenue_growth_rate: 15.5,
      sales_volumn: 1200,
      revenue: 300000000,
      seller_name: 'Skincare Official',
    }));

    const mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/tiktok/product/rank')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: productsPayload }),
        };
      }
      const parsed = JSON.parse(init?.body as string) as { product_id: string };
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: [
            {
              video_id: `vid_${parsed.product_id}`,
              video_title: `Video for ${parsed.product_id}`,
              belonged_creator_handle: 'creator_skincare',
              views: 5000,
              revenue: 1500000,
            },
          ],
        }),
      };
    });

    const client = new KalodataHttpClient({
      apiKey: 'test-kalodata-key',
      fetchFn: mockFetch as unknown as typeof fetch,
      videoEnrichDelayMs: 0,
    });

    const results = await client.fetchWinningCandidates({
      niche: 'skincare',
      maxPriceIdr: 1_000_000_000,
      minRating: 4.8,
      limit: 15,
    });

    expect(results).toHaveLength(6);
    expect(mockFetch).toHaveBeenCalledTimes(7); // 1 product rank + 6 video rank
    expect(results[5]?.priceIdr).toBe(300000);
    expect(results[5]?.referenceVideos[0]?.videoId).toBe('vid_1736805940517045605');
  });

  it('throws 429/502 AppError when Kalodata API returns non-2xx status or success=false', async () => {
    const rateLimitFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      text: async () => 'Rate limit exceeded',
    });

    const rateLimitClient = new KalodataHttpClient({
      apiKey: 'test-kalodata-key',
      baseUrl: 'https://api.kalodata.test',
      fetchFn: rateLimitFetch as unknown as typeof fetch,
    });

    await expect(
      rateLimitClient.fetchWinningCandidates({
        niche: 'perlengkapan_dapur',
        maxPriceIdr: 99999,
        minRating: 4.8,
        limit: 10,
      })
    ).rejects.toMatchObject({
      statusCode: 429,
      message: expect.stringMatching(/Kalodata API error \(429/),
    });

    const rejectedFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: false,
        code: 'INVALID_KEY',
        message: 'Invalid secret-key',
      }),
    });

    const rejectedClient = new KalodataHttpClient({
      apiKey: 'bad-key',
      fetchFn: rejectedFetch as unknown as typeof fetch,
    });

    await expect(
      rejectedClient.fetchWinningCandidates({
        niche: 'perlengkapan_dapur',
        maxPriceIdr: 99999,
        minRating: 4.8,
        limit: 10,
      })
    ).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof AppError &&
        err.statusCode === 502 &&
        err.message.includes('Invalid secret-key')
    );
  });

  it('retries automatically on transient EdgeOne 554 Response Timeout and succeeds when cache warms', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 554,
        statusText: 'Response Timeout by EdgeOne',
        text: async () => 'Response Timeout by EdgeOne',
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: [
            {
              product_id: '1730659179602413069',
              product_name: 'Parutan Duduk Keripik Perlengkapan Dapur',
              unit_price: 28483.51,
              commission_rate: 8.5,
              sales_volumn: 888,
              revenue: 25293353.33,
              seller_name: 'Tosera Store',
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: [],
        }),
      });

    const client = new KalodataHttpClient({
      apiKey: 'test-kalodata-key',
      fetchFn: mockFetch as unknown as typeof fetch,
      retryDelayMs: 0,
    });

    const results = await client.fetchWinningCandidates({
      niche: 'perlengkapan_dapur',
      maxPriceIdr: 99999,
      minRating: 4.8,
      limit: 10,
    });

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(results).toHaveLength(1);
    expect(results[0]?.kalodataProductId).toBe('1730659179602413069');
  });
});
