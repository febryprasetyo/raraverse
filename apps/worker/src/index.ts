import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import {
  LocalVideoRenderJobSchema,
  PublishJobPayloadSchema,
} from '@ebieshop/shared';
import { loadWorkerEnvConfig } from './config/env.js';
import { processLocalVideoRender } from './ffmpeg/render-worker.js';
import { processPlaywrightPublish } from './playwright/publish-worker.js';
import { NeedsManualLoginError } from './playwright/session-guard.js';
import {
  EdgeTtsProvider,
  ElevenLabsProvider,
  MockTtsProvider,
  type ITtsProvider,
} from './tts/providers.js';

export function bootstrapWorker() {
  const env = loadWorkerEnvConfig(process.env);
  return {
    status: 'ready' as const,
    mode: env.DATA_SOURCE_MODE,
    rawMediaDir: env.RAW_MEDIA_DIR,
  };
}

export async function startWorkerRuntime() {
  const env = loadWorkerEnvConfig(process.env);
  const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

  const selectTtsProvider = (provider: 'edge-tts' | 'elevenlabs'): ITtsProvider => {
    if (env.TTS_MODE === 'mock') {
      return new MockTtsProvider();
    }
    if (provider === 'elevenlabs' && process.env.ELEVENLABS_API_KEY) {
      return new ElevenLabsProvider({ apiKey: process.env.ELEVENLABS_API_KEY });
    }
    return new EdgeTtsProvider();
  };

  const renderWorker = new Worker(
    'local-video-render',
    async (job) => {
      const parsed = LocalVideoRenderJobSchema.parse(job.data);
      return processLocalVideoRender(parsed, {
        ttsProvider: selectTtsProvider(parsed.ttsProvider),
        vpsApiUrl: env.VPS_API_URL,
        workerSecret: env.WORKER_SHARED_SECRET,
      });
    },
    { connection, concurrency: 1 }
  );

  const playwrightWorker = new Worker(
    'local-playwright-publish',
    async (job) => {
      const parsed = PublishJobPayloadSchema.parse(job.data);
      const publicR2BaseUrl =
        process.env.R2_PUBLIC_BASE_URL ?? 'http://127.0.0.1:9000/ebieshop-mock';
      try {
        return await processPlaywrightPublish(parsed, {
          publicR2BaseUrl,
          headless: env.PLAYWRIGHT_HEADLESS,
        });
      } catch (err) {
        if (
          err instanceof NeedsManualLoginError &&
          (parsed.platform === 'SHOPEE_VIDEO' || parsed.platform === 'TIKTOK_STUDIO')
        ) {
          await fetch(
            `${env.VPS_API_URL.replace(/\/$/, '')}/api/v1/workers/session-expired`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${env.WORKER_SHARED_SECRET}`,
              },
              body: JSON.stringify({
                publishJobId: parsed.publishJobId,
                platform: parsed.platform,
                reason: err.message,
              }),
            }
          ).catch(() => {});
        }
        throw err;
      }
    },
    { connection, concurrency: 1 }
  );

  const heartbeatInterval = setInterval(() => {
    void fetch(`${env.VPS_API_URL.replace(/\/$/, '')}/api/v1/workers/heartbeat`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.WORKER_SHARED_SECRET}`,
      },
    }).catch(() => {
      // Heartbeat retry happens on next interval
    });
  }, 60_000);

  const shutdown = async () => {
    clearInterval(heartbeatInterval);
    await Promise.all([renderWorker.close(), playwrightWorker.close()]);
    await connection.quit();
  };

  return { renderWorker, playwrightWorker, shutdown };
}

const isMain = process.argv[1]?.endsWith('index.ts') || process.argv[1]?.endsWith('index.js');
if (isMain && process.env.NODE_ENV !== 'test') {
  void startWorkerRuntime().then(() => {
    console.log('[ebieshop-worker] Local BullMQ workers & heartbeat started');
  });
}
