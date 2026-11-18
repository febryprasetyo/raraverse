import { afterEach, describe, expect, it, vi } from 'vitest';
import { LnkBioHttpClient } from '../adapters/lnkbio-client.js';
import { buildApp } from '../app.js';
import { loadEnvConfig } from '../config/env.js';
import { assertSafeAffiliateUrl } from '../services/lnkbio-automation.js';

const testEnv = loadEnvConfig({
  NODE_ENV: 'test',
  PORT: '3001',
  DATA_SOURCE_MODE: 'mock',
  SKIP_QUEUE_CONNECTION: 'true',
  ADMIN_JWT_SECRET: 'test-admin-secret-1234567890',
  WORKER_SHARED_SECRET: 'test-worker-secret-1234567890',
  DATABASE_URL: 'postgresql://ebieshop:ebieshop@127.0.0.1:5432/ebieshop',
  REDIS_URL: 'redis://127.0.0.1:6379',
  PUBLIC_REDIRECT_BASE_URL: 'https://ebieshop.id',
});

const adminHeaders = {
  authorization: `Bearer ${testEnv.ADMIN_JWT_SECRET}`,
};

describe('Lnk.Bio API Client, OAuth, Hybrid Redirect & Semi-Automatic Lifecycle', () => {
  let app: Awaited<ReturnType<typeof buildApp>> | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it('supports OAuth client_credentials, CRUD endpoints, list, me, and groups in LnkBioHttpClient', async () => {
    const mockFetch = vi
      .fn()
      // 1. exchangeClientCredentials
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            access_token: 'fresh_token_001',
            refresh_token: 'refresh_001',
            expires_in: 3600,
          }),
      })
      // 2. getProfile (/me)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            status: true,
            data: { id: 'acc_99', username: 'ebieshop', plan: 'MINI' },
          }),
      })
      // 3. listGroups (/group/list)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            status: true,
            data: [{ group_id: 'grp_skin', name: 'Skincare', count: 3 }],
          }),
      })
      // 4. publishLink (/lnk/add)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            status: true,
            data: { lnk_id: 'lnk_777', link: 'https://ebieshop.id/r/GLOW1' },
          }),
      })
      // 5. editLink (/lnk/edit)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ status: true, data: { lnk_id: 'lnk_777' } }),
      })
      // 6. listLinks (/lnk/list)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            status: true,
            data: [
              {
                lnk_id: 'lnk_777',
                title: '#003 - Glow Serum Updated',
                link: 'https://ebieshop.id/r/GLOW1',
                clicks: 48,
                position: 1,
              },
            ],
          }),
      })
      // 7. reorderLinks (/lnk/reorder)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ status: true }),
      })
      // 8. deleteLink (/lnk/delete)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ status: true }),
      });

    const client = new LnkBioHttpClient({
      clientId: 'lnkpriv_test',
      clientSecret: 'secret_test',
      retryDelayMs: 0,
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const tokenRes = await client.exchangeClientCredentials();
    expect(tokenRes.accessToken).toBe('fresh_token_001');
    expect(tokenRes.refreshToken).toBe('refresh_001');
    const [, tokenInit] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect((tokenInit.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from('lnkpriv_test:secret_test').toString('base64')}`
    );

    const profile = await client.getProfile();
    expect(profile.username).toBe('ebieshop');
    expect(profile.planTier).toBe('MINI');
    expect(profile.supportsGroups).toBe(true);

    const groups = await client.listGroups();
    expect(groups).toEqual([{ groupId: 'grp_skin', groupName: 'Skincare', linkCount: 3 }]);

    const added = await client.publishLink({
      title: '#003 - Glow Serum',
      url: 'https://ebieshop.id/r/GLOW1',
      imageUrl: 'https://cdn.example.com/glow.jpg',
      groupId: 'grp_skin',
      scheduleFrom: '2026-11-18T00:00:00Z',
      scheduleTo: '2026-11-25T23:59:59Z',
      position: 1,
    });
    expect(added.lnkBioId).toBe('lnk_777');
    const [, addInit] = mockFetch.mock.calls[3] as [string, RequestInit];
    expect(addInit.body).toContain('link=https%3A%2F%2Febieshop.id%2Fr%2FGLOW1');
    expect(addInit.body).toContain('schedule_from=2026-11-18T00%3A00%3A00Z');
    expect(addInit.body).toContain('schedule_to=2026-11-25T23%3A59%3A59Z');
    expect(addInit.body).toContain('position=1');

    const edited = await client.editLink({
      lnkBioId: 'lnk_777',
      title: '#003 - Glow Serum Updated',
      url: 'https://ebieshop.id/r/GLOW1',
    });
    expect(edited.lnkBioId).toBe('lnk_777');

    const listed = await client.listLinks();
    expect(listed).toHaveLength(1);
    expect(listed[0]?.clicks).toBe(48);

    const reordered = await client.reorderLinks(['lnk_777']);
    expect(reordered.reordered).toBe(true);

    const deleted = await client.deleteLink('lnk_777');
    expect(deleted.deleted).toBe(true);
  });

  it('auto-refreshes token on 401 Unauthorized, retries 5xx with backoff, and falls back without group_id on non-MINI error', async () => {
    const mockFetch = vi
      .fn()
      // 1st attempt: 401 Unauthorized
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => JSON.stringify({ status: false, message: '400 Not authenticated' }),
      })
      // Refresh via client_credentials
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ access_token: 'refreshed_tok', expires_in: 3600 }),
      })
      // 2nd attempt after refresh: 503 transient failure
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        text: async () => 'upstream busy',
      })
      // 3rd attempt: non-MINI account rejects group_id
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: async () => JSON.stringify({ status: false, message: 'MINI plan required for group_id' }),
      })
      // Fallback attempt without group_id succeeds
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ status: true, data: { lnk_id: 'lnk_fallback' } }),
      });

    const client = new LnkBioHttpClient({
      accessToken: 'expired_tok',
      clientId: 'lnkpriv_test',
      clientSecret: 'secret_test',
      retryDelayMs: 0,
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const published = await client.publishLink({
      title: '#004 - Serum Fallback',
      url: 'https://shope.ee/fallback',
      groupId: 'grp_mini_only',
    });

    expect(published.lnkBioId).toBe('lnk_fallback');
    expect(published.groupDroppedFallback).toBe(true);
    const [, finalInit] = mockFetch.mock.calls[4] as [string, RequestInit];
    expect(String(finalInit.body)).not.toContain('group_id=');
  });

  it('validates safe affiliate URLs and blocks open-redirect / SSRF targets', () => {
    expect(() => assertSafeAffiliateUrl('https://shope.ee/mock-rak01')).not.toThrow();
    expect(() => assertSafeAffiliateUrl('http://127.0.0.1:8080/internal')).toThrow();
    expect(() => assertSafeAffiliateUrl('https://localhost/admin')).toThrow();
    expect(() => assertSafeAffiliateUrl('javascript:alert(1)')).toThrow();
  });

  it('tracks public GET /r/:code clicks, auto-edits on product update, and enforces operator confirmation for delete & reorder', async () => {
    app = await buildApp({ env: testEnv, skipQueueConnection: true });

    // 1. Check initial overview
    const overviewRes = await app.inject({
      method: 'GET',
      url: '/api/v1/lnkbio/overview',
      headers: adminHeaders,
    });
    expect(overviewRes.statusCode).toBe(200);
    const overview = overviewRes.json();
    expect(overview.links.length).toBeGreaterThanOrEqual(2);
    const firstLink = overview.links[0];
    expect(firstLink.redirectCode).toBe('RAK01');

    // 2. Public redirect GET /r/RAK01 should increment internalClicks and return 302 to clean original affiliate URL
    const redirectRes = await app.inject({
      method: 'GET',
      url: '/r/RAK01',
    });
    expect(redirectRes.statusCode).toBe(302);
    expect(redirectRes.headers.location).toBe('https://shope.ee/mock-rak01');

    // 3. Unknown redirect code returns 404
    const missingRedirect = await app.inject({
      method: 'GET',
      url: '/r/UNKNOWN999',
    });
    expect(missingRedirect.statusCode).toBe(404);

    // 4. Auto-Edit when updating an ACTIVE product's name
    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/products/${firstLink.productId}`,
      headers: adminHeaders,
      payload: {
        name: 'Rak Bumbu 2 Tingkat Edisi Promo',
      },
    });
    expect(patchRes.statusCode).toBe(200);

    // 5. Semi-automatic: pausing product must NOT auto-delete Lnk.Bio link
    const pauseRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/products/${firstLink.productId}`,
      headers: adminHeaders,
      payload: {
        status: 'PAUSED',
      },
    });
    expect(pauseRes.statusCode).toBe(200);
    expect(pauseRes.json().product.affiliateUrls.lnkBioId).toBeTruthy();

    const afterPauseOverview = await app.inject({
      method: 'GET',
      url: '/api/v1/lnkbio/overview',
      headers: adminHeaders,
    });
    expect(afterPauseOverview.json().readyToDeleteCount).toBeGreaterThanOrEqual(1);

    // 6. Periodic sync creates snapshot and computes performanceScore
    const syncRes = await app.inject({
      method: 'POST',
      url: '/api/v1/lnkbio/sync',
      headers: adminHeaders,
      payload: {},
    });
    expect(syncRes.statusCode).toBe(200);
    expect(syncRes.json().snapshotsCreated).toBeGreaterThanOrEqual(2);

    // 7. Operator-confirmed Bulk Reorder
    const linksForReorder = afterPauseOverview.json().links as Array<{ productId: string }>;
    const reversedIds = linksForReorder.map((l) => l.productId).reverse();
    const reorderRes = await app.inject({
      method: 'POST',
      url: '/api/v1/lnkbio/reorder',
      headers: adminHeaders,
      payload: {
        orderedProductIds: reversedIds,
      },
    });
    expect(reorderRes.statusCode).toBe(200);
    expect(reorderRes.json().reorderedCount).toBe(reversedIds.length);

    // 8. Operator-confirmed Delete removes link from Lnk.Bio and clears product.affiliateUrls.lnkBioId
    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/lnkbio/links/${firstLink.productId}`,
      headers: adminHeaders,
    });
    expect(deleteRes.statusCode).toBe(200);
    expect(deleteRes.json()).toEqual({ deleted: true, productId: firstLink.productId });

    const productAfterDelete = await app.inject({
      method: 'GET',
      url: `/api/v1/products/${firstLink.productId}`,
      headers: adminHeaders,
    });
    expect(productAfterDelete.json().product.affiliateUrls.lnkBioId).toBeUndefined();

    // 9. Logs & Metrics endpoints return recorded operations and snapshots
    const logsRes = await app.inject({
      method: 'GET',
      url: '/api/v1/lnkbio/logs',
      headers: adminHeaders,
    });
    expect(logsRes.statusCode).toBe(200);
    const operations = logsRes.json().items.map((i: { operation: string }) => i.operation);
    expect(operations).toContain('EDIT');
    expect(operations).toContain('REORDER');
    expect(operations).toContain('DELETE');

    const metricsRes = await app.inject({
      method: 'GET',
      url: '/api/v1/lnkbio/metrics',
      headers: adminHeaders,
    });
    expect(metricsRes.statusCode).toBe(200);
    expect(metricsRes.json().items.length).toBeGreaterThanOrEqual(2);
  });

  it('handles OAuth authorize URL and connect flow for Lnk.Bio', async () => {
    app = await buildApp({ env: testEnv, skipQueueConnection: true });

    const authUrlRes = await app.inject({
      method: 'GET',
      url: '/api/v1/lnkbio/auth/authorize-url?redirectUri=https%3A%2F%2Febieshop.id%2Foauth%2Fcallback',
      headers: adminHeaders,
    });
    expect(authUrlRes.statusCode).toBe(200);
    expect(authUrlRes.json().authorizeUrl).toContain('https://lnk.bio/manage/access');

    const connectRes = await app.inject({
      method: 'POST',
      url: '/api/v1/lnkbio/auth/connect',
      headers: adminHeaders,
      payload: {
        mode: 'client_credentials',
      },
    });
    expect(connectRes.statusCode).toBe(200);
    expect(connectRes.json().connected).toBe(true);
    expect(connectRes.json().profile.planTier).toBe('MINI');
  });

  it('auto-backfills legacy products that already have affiliateUrls.lnkBioId into overview', async () => {
    app = await buildApp({ env: testEnv, skipQueueConnection: true });

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/products',
      headers: adminHeaders,
      payload: {
        niche: 'skincare',
        name: 'Serum Legacy Backfill',
        priceIdr: 79000,
        rating: 4.9,
        commissionRatePct: 12,
        isCommissionXtra: true,
        isOfficialStore: true,
        biolinkNumber: '089',
        triggerKeyword: 'LEGACY89',
        affiliateUrls: {
          shopeeShortlink: 'https://shope.ee/legacy89',
          lnkBioId: 'legacy_lnkbio_89',
        },
        rawMediaDir: 'raw_media_dir/legacy89',
        rawMediaClipCount: 1,
      },
    });
    expect(createRes.statusCode).toBe(201);
    const createdProduct = createRes.json().product;

    const overviewRes = await app.inject({
      method: 'GET',
      url: '/api/v1/lnkbio/overview',
      headers: adminHeaders,
    });
    expect(overviewRes.statusCode).toBe(200);
    const backfilled = (overviewRes.json().links as Array<{ productId: string; lnkBioId: string }>).find(
      (l) => l.productId === createdProduct.id
    );
    expect(backfilled?.lnkBioId).toBe('legacy_lnkbio_89');
  });

  it('detects FREE tier from live Lnk.Bio /me info + /group/list upgrade envelope', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            status: true,
            errors: [],
            info: {
              username: '@rara.verse0',
              url: 'https://lnk.bio/raraverse',
            },
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            status: false,
            errors: ['You need to upgrade to use this feature'],
            info: [],
          }),
      });

    const client = new LnkBioHttpClient({
      accessToken: 'live_tok',
      retryDelayMs: 0,
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const profile = await client.getProfile();
    expect(profile.username).toBe('rara.verse0');
    expect(profile.planTier).toBe('FREE');
    expect(profile.supportsGroups).toBe(false);
  });

  it('sanitizes HTML WAF errors and falls back to /lnk/edit position update on reorderLinks', async () => {
    const mockFetch = vi
      .fn()
      // 1. /lnk/reorder returns Cloudflare 403 HTML
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        text: async () => '<!DOCTYPE html><html><title>Attention Required! | Cloudflare</title></html>',
      })
      // 2. Fallback listLinks
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            status: true,
            data: [
              {
                link_id: '14810610',
                title: 'Link A',
                link: 'https://s.shopee.co.id/test',
                position: 2,
              },
            ],
          }),
      })
      // 3. Fallback editLink with position=1
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            status: true,
            data: { link_id: '14810610', position: 1 },
          }),
      });

    const client = new LnkBioHttpClient({
      accessToken: 'live_tok',
      retryDelayMs: 0,
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const res = await client.reorderLinks(['14810610']);
    expect(res.reordered).toBe(true);
    const [, editInit] = mockFetch.mock.calls[2] as [string, RequestInit];
    expect(String(editInit.body)).toContain('link_id=14810610');
    expect(String(editInit.body)).toContain('position=1');
  });
});
