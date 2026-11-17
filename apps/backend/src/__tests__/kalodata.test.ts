import { describe, expect, it, vi } from 'vitest';
import { KalodataHttpClient } from '../adapters/kalodata-client.js';

describe('KalodataHttpClient', () => {
  it('filters candidates to priceIdr < 100000 and rating >= 4.8 and validates with Zod', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          {
            id: 'kd_valid_1',
            title: 'Rak Bumbu Minimalis 2 Susun',
            category: 'perlengkapan_dapur',
            price_idr: 55000,
            rating: 4.9,
            commission_rate_pct: 12,
            is_commission_xtra: true,
            is_official_store: true,
            weekly_revenue_idr: 15000000,
            weekly_units_sold: 270,
            reference_video_urls: ['https://cdn.example.com/ref1.mp4'],
          },
          {
            id: 'kd_too_expensive',
            title: 'Blender Mahal 250rb',
            category: 'perlengkapan_dapur',
            price_idr: 250000,
            rating: 4.9,
            commission_rate_pct: 10,
            is_commission_xtra: true,
            is_official_store: true,
            weekly_revenue_idr: 25000000,
            weekly_units_sold: 100,
            reference_video_urls: [],
          },
          {
            id: 'kd_low_rating',
            title: 'Spatula Murah Rating Rendah',
            category: 'perlengkapan_dapur',
            price_idr: 19000,
            rating: 4.3,
            commission_rate_pct: 15,
            is_commission_xtra: true,
            is_official_store: false,
            weekly_revenue_idr: 3000000,
            weekly_units_sold: 150,
            reference_video_urls: [],
          },
        ],
      }),
    });

    const client = new KalodataHttpClient({
      apiKey: 'test-kalodata-key',
      baseUrl: 'https://api.kalodata.test',
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const results = await client.fetchWinningCandidates({
      niche: 'perlengkapan_dapur',
      maxPriceIdr: 99999,
      minRating: 4.8,
      limit: 10,
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain('https://api.kalodata.test');
    expect((init.headers as Record<string, string>)['Authorization']).toBe(
      'Bearer test-kalodata-key'
    );

    expect(results).toHaveLength(1);
    expect(results[0]?.kalodataProductId).toBe('kd_valid_1');
    expect(results[0]?.priceIdr).toBe(55000);
    expect(results[0]?.rating).toBe(4.9);
  });

  it('throws descriptive error when Kalodata API returns non-2xx status', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      text: async () => 'Rate limit exceeded',
    });

    const client = new KalodataHttpClient({
      apiKey: 'test-kalodata-key',
      baseUrl: 'https://api.kalodata.test',
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    await expect(
      client.fetchWinningCandidates({
        niche: 'perlengkapan_dapur',
        maxPriceIdr: 99999,
        minRating: 4.8,
        limit: 10,
      })
    ).rejects.toThrow(/Kalodata API error \(429/);
  });
});
