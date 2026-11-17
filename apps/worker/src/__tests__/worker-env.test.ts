import { describe, it, expect } from 'vitest';
import { loadWorkerEnvConfig } from '../config/env.js';

describe('@ebieshop/worker config', () => {
  it('loads valid worker env config with mock mode in development', () => {
    const env = loadWorkerEnvConfig({
      NODE_ENV: 'development',
      DATA_SOURCE_MODE: 'mock',
      VPS_API_URL: 'https://api.example.com',
      WORKER_SHARED_SECRET: 'test-worker-secret-at-least-32-chars-long',
      REDIS_URL: 'redis://100.64.0.1:6379',
      RAW_MEDIA_DIR: 'D:\\ebieshop-media\\raw',
      PLAYWRIGHT_HEADLESS: 'false',
    });

    expect(env.DATA_SOURCE_MODE).toBe('mock');
    expect(env.PLAYWRIGHT_HEADLESS).toBe(false);
    expect(env.RAW_MEDIA_DIR).toBe('D:\\ebieshop-media\\raw');
  });

  it('fails fast in production if DATA_SOURCE_MODE=mock', () => {
    expect(() =>
      loadWorkerEnvConfig({
        NODE_ENV: 'production',
        DATA_SOURCE_MODE: 'mock',
        VPS_API_URL: 'https://api.example.com',
        WORKER_SHARED_SECRET: 'prod-worker-secret-at-least-32-chars-long',
        REDIS_URL: 'redis://100.64.0.1:6379',
      })
    ).toThrow(/DATA_SOURCE_MODE=mock is forbidden in production/);
  });
});
