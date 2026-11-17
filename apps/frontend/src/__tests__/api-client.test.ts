import { describe, it, expect, vi } from 'vitest';
import { createBackendClient } from '../lib/api-client.js';

describe('@ebieshop/frontend api-client', () => {
  it('fetches and validates products against @ebieshop/shared schema', async () => {
    const mockFetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          items: [
            {
              id: '550e8400-e29b-41d4-a716-446655440001',
              kalodataProductId: 'kd_rak_001',
              niche: 'perlengkapan_dapur',
              name: 'Rak Bumbu Dapur 2 Tingkat',
              priceIdr: 49900,
              rating: 4.9,
              commissionRatePct: 12.5,
              isCommissionXtra: true,
              isOfficialStore: true,
              biolinkNumber: '001',
              triggerKeyword: 'RAK01',
              affiliateUrls: { shopeeShortlink: 'https://shope.ee/mock' },
              kalodataSnapshot: null,
              rawMediaDir: 'raw_media_dir/550e8400-e29b-41d4-a716-446655440001',
              rawMediaClipCount: 4,
              status: 'ACTIVE',
              createdAt: '2026-11-16T07:00:00.000Z',
              updatedAt: '2026-11-16T07:00:00.000Z',
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    ) as unknown as typeof fetch;

    const client = createBackendClient({
      baseUrl: 'http://127.0.0.1:3001',
      token: 'test-token',
      fetchImpl: mockFetch,
    });

    const items = await client.listProducts();
    expect(items).toHaveLength(1);
    expect(items[0]?.triggerKeyword).toBe('RAK01');
  });

  it('throws on non-2xx backend responses', async () => {
    const mockFetch = vi.fn(async () => new Response('Unauthorized', { status: 401 })) as unknown as typeof fetch;

    const client = createBackendClient({
      baseUrl: 'http://127.0.0.1:3001',
      token: 'bad-token',
      fetchImpl: mockFetch,
    });

    await expect(client.listProducts()).rejects.toThrow(/401/);
  });
});
