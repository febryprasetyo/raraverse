import { describe, it, expect, afterEach } from 'vitest';
import { buildApp } from '../app.js';
import { loadEnvConfig } from '../config/env.js';

describe('@ebieshop/backend container and product routes', () => {
  const testEnv = loadEnvConfig({
    NODE_ENV: 'test',
    PORT: '3001',
    DATA_SOURCE_MODE: 'mock',
    ADMIN_JWT_SECRET: 'test-admin-secret-at-least-32-chars-long',
    WORKER_SHARED_SECRET: 'test-worker-secret-at-least-32-chars-long',
    DATABASE_URL: 'postgresql://ebieshop:ebieshop@127.0.0.1:5432/ebieshop',
    REDIS_URL: 'redis://127.0.0.1:6379',
  });

  let app: Awaited<ReturnType<typeof buildApp>> | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it('serves validated mock products from @ebieshop/mocks when DATA_SOURCE_MODE=mock', async () => {
    app = await buildApp({ env: testEnv, skipQueueConnection: true });

    const unauth = await app.inject({
      method: 'GET',
      url: '/api/v1/products',
    });
    expect(unauth.statusCode).toBe(401);

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/products',
      headers: {
        authorization: `Bearer ${testEnv.ADMIN_JWT_SECRET}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items.length).toBeGreaterThanOrEqual(2);
    expect(body.items[0].triggerKeyword).toBe('RAK01');
  });
});
