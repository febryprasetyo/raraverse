import { describe, expect, it, vi } from 'vitest';
import { loadEnvConfig } from '../config/env.js';
import { ThreadsHttpClient, cleanThreadsOAuthCode } from '../adapters/threads-client.js';
import {
  MockLlmProvider,
  MockOAuthTokenRepository,
  MockProductRepository,
  MockThreadsRepository,
} from '../adapters/mock-adapters.js';
import { ThreadsAutomationService, isPublicHttpsUrl } from '../services/threads-automation.js';
import { buildApp } from '../app.js';

function createTestEnv(overrides?: Record<string, string | undefined>) {
  return loadEnvConfig({
    NODE_ENV: 'test',
    DATA_SOURCE_MODE: 'mock',
    THREADS_MODE: 'mock',
    ADMIN_JWT_SECRET: 'test-admin-jwt-secret-minimum-32-chars',
    WORKER_SHARED_SECRET: 'test-worker-shared-secret-minimum-32-chars',
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/ebieshop_test',
    REDIS_URL: 'redis://localhost:6379',
    SKIP_QUEUE_CONNECTION: 'true',
    ...overrides,
  });
}

describe('Threads Automation — Env, OAuth 2.0, Chained Publisher & Routes', () => {
  it('parses THREADS_* and backward-compatible TREADS_* aliases independently from META_API_MODE', () => {
    const env = createTestEnv({
      META_API_MODE: 'mock',
      THREADS_MODE: 'real',
      TREADS_APP_ID: '1811443116804615',
      TREADS_APP_SECRET: 'test_threads_secret_value',
      TREADS_DISPLAY_NAME: 'raraverse',
    });

    expect(env.META_API_MODE).toBe('mock');
    expect(env.THREADS_MODE).toBe('real');
    expect(env.THREADS_APP_ID).toBe('1811443116804615');
    expect(env.THREADS_APP_SECRET).toBe('test_threads_secret_value');
    expect(env.THREADS_DISPLAY_NAME).toBe('raraverse');
  });

  it('cleans trailing #_ from Meta OAuth redirect code and validates public HTTPS URLs', () => {
    expect(cleanThreadsOAuthCode('AQBxCode123#_')).toBe('AQBxCode123');
    expect(isPublicHttpsUrl('https://shope.ee/mock01')).toBe(true);
    expect(isPublicHttpsUrl('http://localhost:3001/r/RAK01')).toBe(false);
    expect(isPublicHttpsUrl('http://127.0.0.1:9000/ebieshop-media/a.mp4')).toBe(false);
  });

  it('ThreadsHttpClient supports authorize URL, code exchange + 60d long-lived exchange, and client_credentials app token', async () => {
    const fetchMock = vi
      .fn()
      // 1. POST /oauth/access_token (authorization_code)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ access_token: 'short_tok_123', user_id: '25000112233' }),
      })
      // 2. GET /access_token?grant_type=th_exchange_token
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ access_token: 'long_tok_60d', expires_in: 5184000 }),
      })
      // 3. GET /oauth/access_token?grant_type=client_credentials
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ access_token: 'app_tok_999', expires_in: 5184000 }),
      });

    const client = new ThreadsHttpClient({
      appId: '1811443116804615',
      appSecret: 'secret_abc',
      displayName: 'raraverse',
      fetchFn: fetchMock as unknown as typeof fetch,
      pollIntervalMs: 0,
    });

    const auth = client.getAuthorizeUrl({
      redirectUri: 'https://localhost:3000/products/threads',
      state: 'st_1',
    });
    expect(auth.authorizeUrl).toContain('https://threads.net/oauth/authorize');
    expect(auth.authorizeUrl).toContain('client_id=1811443116804615');

    const userToken = await client.exchangeAuthorizationCode(
      'code_with_hash#_',
      'https://localhost:3000/products/threads'
    );
    expect(userToken.accessToken).toBe('long_tok_60d');
    expect(userToken.tokenType).toBe('USER');
    expect(userToken.userId).toBe('25000112233');

    const [postUrl, postInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(postUrl).toBe('https://graph.threads.net/oauth/access_token');
    expect(String(postInit.body)).toContain('code=code_with_hash');
    expect(String(postInit.body)).not.toContain('%23_');

    const appToken = await client.exchangeAppClientCredentials();
    expect(appToken.accessToken).toBe('app_tok_999');
    expect(appToken.tokenType).toBe('APP');
    const [appUrl] = fetchMock.mock.calls[2] as [string];
    expect(appUrl).toContain('grant_type=client_credentials');
  });

  it('ThreadsHttpClient publishes chained thread (root + reply_to_id) and handles partial reply failure', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: 'cnt_root_1' }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: 'post_root_1' }) })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'post_root_1',
          permalink: 'https://www.threads.net/@raraverse/post/C_live1',
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { message: 'Temporary reply error' } }),
      });

    const client = new ThreadsHttpClient({
      appId: '1811443116804615',
      appSecret: 'secret_abc',
      userId: '25000112233',
      userAccessToken: 'tok_live',
      fetchFn: fetchMock as unknown as typeof fetch,
      pollIntervalMs: 0,
    });

    const partial = await client.publishChainedThread({
      mediaType: 'TEXT',
      rootText: 'Hook produk',
      replyText: 'Link https://shope.ee/mock01',
    });

    expect(partial.rootPostId).toBe('post_root_1');
    expect(partial.replyPostId).toBeNull();
    expect(partial.partialError).toContain('Temporary reply error');
  });

  it('ThreadsAutomationService uses direct shortlink when PUBLIC_REDIRECT_BASE_URL is localhost and generates LLM copy', async () => {
    const env = createTestEnv({
      PUBLIC_REDIRECT_BASE_URL: 'http://localhost:3001',
      TOKEN_ENCRYPTION_KEY:
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    });
    const products = new MockProductRepository();
    const list = await products.listProducts();
    const first = list[0]!;
    const repo = new MockThreadsRepository();
    const oauthTokens = new MockOAuthTokenRepository();

    const service = new ThreadsAutomationService({
      env,
      client: {
        getAuthorizeUrl: () => ({
          authorizeUrl: 'https://threads.net/oauth/authorize?client_id=1811443116804615',
          state: 's1',
          redirectUri: 'https://localhost:3000/products/threads',
          scopes: ['threads_basic'],
        }),
        exchangeAuthorizationCode: async () => ({
          accessToken: 'tok_u',
          tokenType: 'USER',
          expiresInSec: 5184000,
          userId: '25000112233',
        }),
        exchangeAppClientCredentials: async () => ({
          accessToken: 'tok_a',
          tokenType: 'APP',
          expiresInSec: 5184000,
        }),
        refreshLongLivedToken: async () => ({
          accessToken: 'tok_u2',
          tokenType: 'USER',
          expiresInSec: 5184000,
        }),
        getProfile: async () => ({
          userId: '25000112233',
          username: 'raraverse',
          displayName: 'raraverse',
        }),
        publishChainedThread: async () => ({
          rootPostId: 'root_123',
          replyPostId: 'reply_456',
          permalink: 'https://www.threads.net/@raraverse/post/C_123',
          username: 'raraverse',
          httpStatus: 200,
        }),
      },
      repo,
      products,
      llm: new MockLlmProvider(),
      oauthTokens,
    });

    const draft = await service.generateDraft(first.id, 'IMAGE');
    expect(draft.affiliateUrl).not.toContain('localhost');
    expect(draft.replyText).toContain(draft.affiliateUrl);

    const published = await service.publishProductThread({ productId: first.id });
    expect(published.post.status).toBe('PUBLISHED');
    expect(published.post.rootPostId).toBe('root_123');
    expect(published.post.replyPostId).toBe('reply_456');
    expect(published.product.affiliateUrls.threadsPostId).toBe('root_123');
  });

  it('serves /api/v1/threads/* routes with adminGuard', async () => {
    const env = createTestEnv();
    const app = await buildApp({ env, skipQueueConnection: true });

    const unauth = await app.inject({ method: 'GET', url: '/api/v1/threads/overview' });
    expect(unauth.statusCode).toBe(401);

    const authHeaders = { authorization: `Bearer ${env.ADMIN_JWT_SECRET}` };

    const overviewRes = await app.inject({
      method: 'GET',
      url: '/api/v1/threads/overview',
      headers: authHeaders,
    });
    expect(overviewRes.statusCode).toBe(200);
    const overviewBody = overviewRes.json() as {
      profile: { username: string };
      posts: unknown[];
    };
    expect(overviewBody.profile.username).toBe('raraverse');
    expect(overviewBody.posts.length).toBeGreaterThan(0);

    const connectAppRes = await app.inject({
      method: 'POST',
      url: '/api/v1/threads/auth/connect',
      headers: authHeaders,
      payload: { mode: 'client_credentials' },
    });
    expect(connectAppRes.statusCode).toBe(200);
    expect((connectAppRes.json() as { tokenType: string }).tokenType).toBe('APP');

    const healthRes = await app.inject({
      method: 'GET',
      url: '/api/v1/system/health',
      headers: authHeaders,
    });
    expect(healthRes.statusCode).toBe(200);
    const healthJson = healthRes.json() as {
      oauthProviders: Array<{ provider: string }>;
    };
    expect(healthJson.oauthProviders.some((p) => p.provider === 'threads')).toBe(true);

    await app.close();
  });
});
