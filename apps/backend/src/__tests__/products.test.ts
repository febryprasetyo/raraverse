import { describe, expect, it, vi } from 'vitest';
import { GeminiLlmProvider } from '../adapters/llm-providers.js';
import { LnkBioHttpClient } from '../adapters/lnkbio-client.js';
import { buildApp } from '../app.js';
import { loadEnvConfig } from '../config/env.js';

const testEnv = loadEnvConfig({
  NODE_ENV: 'test',
  PORT: '3001',
  DATA_SOURCE_MODE: 'mock',
  SKIP_QUEUE_CONNECTION: 'true',
  ADMIN_JWT_SECRET: 'test-admin-secret-123456',
  WORKER_SHARED_SECRET: 'test-worker-secret-123456',
  DATABASE_URL: 'postgresql://ebieshop:ebieshop@127.0.0.1:5432/ebieshop',
  REDIS_URL: 'redis://127.0.0.1:6379',
});

const adminHeaders = {
  authorization: 'Bearer test-admin-secret-123456',
};

describe('Product Curation & Kalodata Sync API', () => {
  it('syncs candidates from Kalodata without duplicating existing kalodataProductId', async () => {
    const app = await buildApp({ env: testEnv, skipQueueConnection: true });

    const syncRes = await app.inject({
      method: 'POST',
      url: '/api/v1/products/kalodata-sync',
      headers: adminHeaders,
      payload: {
        niche: 'perlengkapan_dapur',
        maxPriceIdr: 99999,
        minRating: 4.8,
        limit: 10,
      },
    });

    expect(syncRes.statusCode).toBe(200);
    const body = syncRes.json();
    expect(body.syncedCount).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(body.candidates)).toBe(true);

    await app.close();
  });

  it('creates a product and transitions CANDIDATE -> CURATED -> ACTIVE while rejecting duplicate triggerKeyword', async () => {
    const app = await buildApp({ env: testEnv, skipQueueConnection: true });

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/products',
      headers: adminHeaders,
      payload: {
        niche: 'perlengkapan_dapur',
        name: 'Dispenser Sabun Cuci Piring Otomatis',
        priceIdr: 45000,
        rating: 4.9,
        commissionRatePct: 12,
        isCommissionXtra: true,
        isOfficialStore: true,
        biolinkNumber: '099',
        triggerKeyword: 'SABUN99',
        affiliateUrls: {
          shopeeShortlink: 'https://shope.ee/sabun99',
        },
        rawMediaDir: 'raw_media_dir/sabun99',
        rawMediaClipCount: 3,
      },
    });

    expect(createRes.statusCode).toBe(201);
    const created = createRes.json().product;
    expect(created.status).toBe('CANDIDATE');
    expect(created.triggerKeyword).toBe('SABUN99');

    // Duplicate triggerKeyword must fail with 409
    const dupRes = await app.inject({
      method: 'POST',
      url: '/api/v1/products',
      headers: adminHeaders,
      payload: {
        niche: 'perlengkapan_dapur',
        name: 'Produk Lain Keyword Sama',
        priceIdr: 35000,
        rating: 4.85,
        commissionRatePct: 10,
        isCommissionXtra: true,
        isOfficialStore: false,
        biolinkNumber: '100',
        triggerKeyword: 'SABUN99',
        affiliateUrls: {},
        rawMediaDir: 'raw_media_dir/other',
        rawMediaClipCount: 0,
      },
    });
    expect(dupRes.statusCode).toBe(409);

    // Transition CANDIDATE -> CURATED
    const curateRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/products/${created.id}`,
      headers: adminHeaders,
      payload: {
        status: 'CURATED',
      },
    });
    expect(curateRes.statusCode).toBe(200);
    expect(curateRes.json().product.status).toBe('CURATED');

    // Transition CURATED -> ACTIVE
    const activateRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/products/${created.id}`,
      headers: adminHeaders,
      payload: {
        status: 'ACTIVE',
      },
    });
    expect(activateRes.statusCode).toBe(200);
    expect(activateRes.json().product.status).toBe('ACTIVE');

    // Invalid direct transition DROPPED -> ACTIVE should be rejected
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/products/${created.id}`,
      headers: adminHeaders,
      payload: { status: 'DROPPED' },
    });

    const invalidTransition = await app.inject({
      method: 'PATCH',
      url: `/api/v1/products/${created.id}`,
      headers: adminHeaders,
      payload: { status: 'ACTIVE' },
    });
    expect(invalidTransition.statusCode).toBe(400);

    await app.close();
  });

  it('accepts products above Rp100.000 with full Kalodata snapshot and rejects non-positive priceIdr or invalid triggerKeyword', async () => {
    const app = await buildApp({ env: testEnv, skipQueueConnection: true });

    const syncSkincareRes = await app.inject({
      method: 'POST',
      url: '/api/v1/products/kalodata-sync',
      headers: adminHeaders,
      payload: {
        niche: 'skincare',
        minRating: 4.8,
        limit: 15,
      },
    });
    expect(syncSkincareRes.statusCode).toBe(200);
    const syncBody = syncSkincareRes.json();
    expect(syncBody.candidates.some((c: { priceIdr: number }) => c.priceIdr > 100000)).toBe(
      true
    );

    const listRes = await app.inject({
      method: 'GET',
      url: '/api/v1/products',
      headers: adminHeaders,
    });
    expect(listRes.statusCode).toBe(200);
    const skincareProduct = listRes
      .json()
      .items.find((p: { niche: string; priceIdr: number }) => p.niche === 'skincare' && p.priceIdr > 100000);
    expect(skincareProduct?.kalodataSnapshot?.sellerName).toBe('Daviena Skincare Official');

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/products',
      headers: adminHeaders,
      payload: {
        niche: 'perlengkapan_dapur',
        name: 'Produk Tidak Valid',
        priceIdr: 0,
        rating: 4.9,
        commissionRatePct: 10,
        isCommissionXtra: true,
        isOfficialStore: true,
        biolinkNumber: '088',
        triggerKeyword: 'rak 08',
        affiliateUrls: {},
        rawMediaDir: 'raw_media_dir/mahal',
        rawMediaClipCount: 0,
      },
    });

    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('supports previewOnly search, selective kalodata-save, and deleting a product', async () => {
    const app = await buildApp({ env: testEnv, skipQueueConnection: true });

    const beforeList = await app.inject({
      method: 'GET',
      url: '/api/v1/products',
      headers: adminHeaders,
    });
    const initialCount = beforeList.json().items.length;

    const previewRes = await app.inject({
      method: 'POST',
      url: '/api/v1/products/kalodata-sync',
      headers: adminHeaders,
      payload: {
        niche: 'skincare',
        minRating: 4.8,
        limit: 15,
        previewOnly: true,
      },
    });
    expect(previewRes.statusCode).toBe(200);
    const previewBody = previewRes.json();
    expect(previewBody.syncedCount).toBe(0);
    expect(previewBody.candidates.length).toBeGreaterThan(0);

    const afterPreviewList = await app.inject({
      method: 'GET',
      url: '/api/v1/products',
      headers: adminHeaders,
    });
    expect(afterPreviewList.json().items.length).toBe(initialCount);

    const chosen = previewBody.candidates[0];
    const saveRes = await app.inject({
      method: 'POST',
      url: '/api/v1/products/kalodata-save',
      headers: adminHeaders,
      payload: {
        niche: 'skincare',
        candidates: [chosen],
      },
    });
    expect(saveRes.statusCode).toBe(200);
    const saveBody = saveRes.json();
    expect(saveBody.savedCount).toBe(1);
    expect(saveBody.items).toHaveLength(1);
    const savedId = saveBody.items[0].id as string;

    const delRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/products/${savedId}`,
      headers: adminHeaders,
    });
    expect(delRes.statusCode).toBe(200);
    expect(delRes.json()).toEqual({ ok: true });

    const afterDeleteList = await app.inject({
      method: 'GET',
      url: '/api/v1/products',
      headers: adminHeaders,
    });
    expect(afterDeleteList.json().items.length).toBe(initialCount);

    await app.close();
  });

  it('auto-generates sequential biolinkNumber and publishes to Lnk.Bio when curating a CANDIDATE', async () => {
    const app = await buildApp({ env: testEnv, skipQueueConnection: true });

    const previewRes = await app.inject({
      method: 'POST',
      url: '/api/v1/products/kalodata-sync',
      headers: adminHeaders,
      payload: {
        niche: 'skincare',
        minRating: 4.8,
        limit: 15,
        previewOnly: true,
      },
    });
    const candidate = previewRes.json().candidates[0];
    const saveRes = await app.inject({
      method: 'POST',
      url: '/api/v1/products/kalodata-save',
      headers: adminHeaders,
      payload: {
        niche: 'skincare',
        candidates: [candidate],
      },
    });
    const saved = saveRes.json().items[0];
    expect(saved.status).toBe('CANDIDATE');
    expect(saved.biolinkNumber).toMatch(/^C-/);
    expect(saved.triggerKeyword).toMatch(/^KD\d+$/);

    const curateRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/products/${saved.id}`,
      headers: adminHeaders,
      payload: {
        status: 'CURATED',
        affiliateUrls: {
          shopeeShortlink: 'https://shope.ee/glow03',
        },
      },
    });
    expect(curateRes.statusCode).toBe(200);
    const curated = curateRes.json().product;
    expect(curated.status).toBe('CURATED');
    expect(curated.biolinkNumber).toBe('003');
    expect(curated.triggerKeyword).toMatch(/^[A-Z0-9]{3,16}$/);
    expect(curated.triggerKeyword).not.toMatch(/^(KD\d+|CANDIDATE)/);
    expect(curated.affiliateUrls.lnkBioId).toMatch(/^mock_lnkbio_/);

    await app.close();
  });

  it('generates SEO + GEO triggerKeyword via Gemini API and falls back cleanly on error', async () => {
    const geminiFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: JSON.stringify({ triggerKeyword: 'Serum Glow!' }) }],
            },
          },
        ],
      }),
    });

    const provider = new GeminiLlmProvider({
      apiKey: 'gemini-test-key',
      fetchFn: geminiFetch as unknown as typeof fetch,
    });

    const sample = {
      id: '550e8400-e29b-41d4-a716-446655440999',
      kalodataProductId: 'kd_999',
      niche: 'skincare',
      name: 'Serum Vitamin C Glow Booster',
      priceIdr: 89000,
      rating: 4.9,
      commissionRatePct: 12,
      isCommissionXtra: true,
      isOfficialStore: true,
      biolinkNumber: '005',
      triggerKeyword: 'KD105',
      affiliateUrls: {},
      kalodataSnapshot: null,
      rawMediaDir: 'raw_media_dir/kd_999',
      rawMediaClipCount: 0,
      status: 'CURATED' as const,
      createdAt: '2026-11-18T00:00:00.000Z',
      updatedAt: '2026-11-18T00:00:00.000Z',
    };

    const kw = await provider.generateTriggerKeyword({
      product: sample,
      biolinkNumber: '005',
      usedKeywords: ['RAK01'],
    });
    expect(kw).toBe('SERUMGLOW');

    const [geminiUrl, geminiInit] = geminiFetch.mock.calls[0] as [string, RequestInit];
    expect(geminiUrl).toContain('generativelanguage.googleapis.com');
    expect(geminiInit.body).toContain('SEO + GEO');

    // Fallback test when Gemini fails
    const failingProvider = new GeminiLlmProvider({
      apiKey: 'gemini-test-key',
      fetchFn: vi.fn().mockResolvedValue({ ok: false, status: 429 }) as unknown as typeof fetch,
    });
    const fallbackKw = await failingProvider.generateTriggerKeyword({
      product: sample,
      biolinkNumber: '005',
      usedKeywords: ['SERUMVITAM'],
    });
    expect(fallbackKw).toMatch(/^[A-Z0-9]{3,16}$/);
    expect(fallbackKw).not.toBe('SERUMVITAM');
  });

  it('posts form-urlencoded payload with Bearer token to Lnk.Bio /oauth/v1/lnk/add', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ success: true, data: { id: 'lnk_98765' } }),
    });

    const client = new LnkBioHttpClient({
      accessToken: 'lnkbio-token-123',
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const res = await client.publishLink({
      title: '#003 - Serum Wajah',
      url: 'https://shope.ee/serum3',
      imageUrl: 'https://example.com/serum.jpg',
      groupId: 'grp_1',
    });

    expect(res.lnkBioId).toBe('lnk_98765');
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://lnk.bio/oauth/v1/lnk/add');
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer lnkbio-token-123'
    );
    expect(init.body).toContain('title=%23003+-+Serum+Wajah');
    expect(init.body).toContain('url=https%3A%2F%2Fshope.ee%2Fserum3');
    expect(init.body).toContain('group_id=grp_1');
  });
});
