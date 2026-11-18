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

  it('validates Lnk.Bio overview and system health with lnkbio provider', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            profile: {
              accountId: 'acc_1',
              username: 'ebieshop.id',
              planTier: 'MINI',
              supportsGroups: true,
              connected: true,
              tokenStatus: 'HEALTHY',
              expiresAt: null,
            },
            groups: [{ groupId: 'grp_1', groupName: 'Skincare', linkCount: 1 }],
            links: [],
            recommendedOrder: [],
            readyToDeleteCount: 0,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            apiStatus: 'OK',
            dataSourceMode: 'mock',
            workerOnline: true,
            lastHeartbeatAt: '2026-11-18T10:00:00.000Z',
            oauthProviders: [
              { provider: 'meta', status: 'HEALTHY', expiresInDays: 45 },
              { provider: 'youtube', status: 'HEALTHY', expiresInDays: 30 },
              { provider: 'lnkbio', status: 'HEALTHY', expiresInDays: 29 },
            ],
            playwrightSessions: [
              { platform: 'SHOPEE_VIDEO', status: 'READY' },
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

    const overview = await client.getLnkBioOverview();
    expect(overview.profile.planTier).toBe('MINI');

    const health = await client.getSystemHealth();
    expect(health.oauthProviders.some((p) => p.provider === 'lnkbio')).toBe(true);
  });

  it('calls Threads endpoints (overview, connect, draft, publish)', async () => {
    const sampleProfile = {
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

    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ profile: sampleProfile, posts: [], logs: [] }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            connected: true,
            tokenType: 'APP',
            profile: sampleProfile,
            expiresAt: '2027-01-17T00:00:00.000Z',
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            rootText: 'Hook produk',
            replyText: 'Link https://shope.ee/mock01',
            affiliateUrl: 'https://shope.ee/mock01',
            mediaUrl: null,
            resolvedMediaType: 'TEXT',
          }),
          { status: 200 }
        )
      ) as unknown as typeof fetch;

    const client = createBackendClient({
      baseUrl: 'http://127.0.0.1:3001',
      token: 'test-token',
      fetchImpl: mockFetch,
    });

    const overview = await client.getThreadsOverview();
    expect(overview.profile.username).toBe('raraverse');

    const conn = await client.connectThreadsAuth({ mode: 'client_credentials' });
    expect(conn.tokenType).toBe('APP');

    const draft = await client.draftThreadsProductPost(
      '550e8400-e29b-41d4-a716-446655440001',
      'TEXT'
    );
    expect(draft.affiliateUrl).toBe('https://shope.ee/mock01');
  });
});
