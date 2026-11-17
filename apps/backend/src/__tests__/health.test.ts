import { describe, it, expect, afterEach } from 'vitest';
import { buildApp } from '../app.js';
import { loadEnvConfig } from '../config/env.js';
import { QUEUE_NAMES } from '../queues/registry.js';

describe('@ebieshop/backend bootstrap', () => {
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

  it('responds 200 on GET /healthz with active dataSourceMode and queue names', async () => {
    app = await buildApp({ env: testEnv, skipQueueConnection: true });

    const res = await app.inject({
      method: 'GET',
      url: '/healthz',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ok');
    expect(body.dataSourceMode).toBe('mock');
    expect(body.queues).toEqual(Object.values(QUEUE_NAMES));
  });

  it('enforces admin and worker bearer token guards', async () => {
    app = await buildApp({ env: testEnv, skipQueueConnection: true });

    const unauthAdmin = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/ping',
    });
    expect(unauthAdmin.statusCode).toBe(401);

    const authAdmin = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/ping',
      headers: {
        authorization: `Bearer ${testEnv.ADMIN_JWT_SECRET}`,
      },
    });
    expect(authAdmin.statusCode).toBe(200);

    const unauthWorker = await app.inject({
      method: 'POST',
      url: '/api/v1/workers/heartbeat',
    });
    expect(unauthWorker.statusCode).toBe(401);

    const authWorker = await app.inject({
      method: 'POST',
      url: '/api/v1/workers/heartbeat',
      headers: {
        authorization: `Bearer ${testEnv.WORKER_SHARED_SECRET}`,
      },
    });
    expect(authWorker.statusCode).toBe(200);
  });

  it('fails fast in production when DATA_SOURCE_MODE=mock', () => {
    expect(() =>
      loadEnvConfig({
        NODE_ENV: 'production',
        DATA_SOURCE_MODE: 'mock',
        ADMIN_JWT_SECRET: 'prod-admin-secret-at-least-32-chars-long',
        WORKER_SHARED_SECRET: 'prod-worker-secret-at-least-32-chars-long',
        DATABASE_URL: 'postgresql://ebieshop:ebieshop@127.0.0.1:5432/ebieshop',
        REDIS_URL: 'redis://127.0.0.1:6379',
      })
    ).toThrow(/DATA_SOURCE_MODE=mock is forbidden in production/);
  });
});
