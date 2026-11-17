import { describe, expect, it } from 'vitest';
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

  it('rejects products with priceIdr >= 100000 or invalid triggerKeyword', async () => {
    const app = await buildApp({ env: testEnv, skipQueueConnection: true });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/products',
      headers: adminHeaders,
      payload: {
        niche: 'perlengkapan_dapur',
        name: 'Produk Terlalu Mahal',
        priceIdr: 150000,
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
});
