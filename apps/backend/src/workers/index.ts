import { Worker } from 'bullmq';
import {
  MetaWebhookPayloadSchema,
  PublishJobPayloadSchema,
} from '@ebieshop/shared';
import {
  FbReelsPublisher,
  IgReelsPublisher,
  OfficialApiPublishProcessor,
  ThreadsPublisher,
  YtShortsPublisher,
  type IPlatformPublisher,
} from '../adapters/official-publishers.js';
import type { AppContainer } from '../container.js';
import { QUEUE_NAMES, type QueueRegistry } from '../queues/registry.js';
import { OAuthTokenRefreshService } from '../services/oauth-refresh.js';
import { PRIME_TIME_SLOTS_WIB } from '../services/prime-time-scheduler.js';

export interface BackendWorkerRuntime {
  workers: Worker[];
  close: () => Promise<void>;
}

/**
 * Registers repeatable BullMQ cron schedules on the VPS:
 * - Weekly OAuth 2.0 token refresh (Monday 03:00 WIB -> 20:00 UTC Sunday)
 * - Weekly Sunday Evaluation aggregator (Sunday 20:00 WIB -> 13:00 UTC Sunday)
 * - Daily Prime Time production slots (09:30, 14:30, 17:30 WIB)
 */
export async function registerBackendCronJobs(
  registry: QueueRegistry
): Promise<void> {
  await registry.queues.OAUTH_TOKEN_REFRESH.add(
    'weekly-oauth-refresh',
    { withinDays: 14 },
    {
      repeat: { pattern: '0 20 * * 0' },
      jobId: 'cron:oauth-token-refresh',
    }
  );

  await registry.queues.WEEKLY_EVALUATION.add(
    'sunday-evaluation',
    {},
    {
      repeat: { pattern: '0 13 * * 0' },
      jobId: 'cron:sunday-evaluation',
    }
  );

  for (const slot of PRIME_TIME_SLOTS_WIB) {
    await registry.queues.SCRIPT_GENERATION.add(
      `prime-time-produce-${slot.name.toLowerCase()}`,
      { slot: slot.name, publishWib: slot.publishWib },
      {
        repeat: { pattern: slot.produceCronUtc },
        jobId: `cron:prime-time:${slot.name}`,
      }
    );
  }

  if (registry.queues.LNKBIO_METRICS_SYNC) {
    await registry.queues.LNKBIO_METRICS_SYNC.add(
      'periodic-lnkbio-metrics-sync',
      {},
      {
        repeat: { pattern: '0 */6 * * *' },
        jobId: 'cron:lnkbio-metrics-sync',
      }
    );
  }
}

export function startBackendWorkers(
  container: AppContainer,
  registry: QueueRegistry
): BackendWorkerRuntime {
  const { connection, env } = { connection: registry.connection, env: container.env };

  const publicBaseUrl = env.R2_PUBLIC_BASE_URL ?? 'http://127.0.0.1:9000/ebieshop-mock';
  const publishers: Partial<Record<string, IPlatformPublisher>> = {};
  if (env.META_API_MODE === 'real' && env.META_PAGE_ACCESS_TOKEN && env.META_OWN_IG_USER_ID) {
    publishers.IG_REELS = new IgReelsPublisher({
      igUserId: env.META_OWN_IG_USER_ID,
      accessToken: env.META_PAGE_ACCESS_TOKEN,
      publicBaseUrl,
    });
  }
  if (env.META_API_MODE === 'real' && env.META_PAGE_ACCESS_TOKEN && env.META_OWN_PAGE_ID) {
    publishers.FB_REELS = new FbReelsPublisher({
      pageId: env.META_OWN_PAGE_ID,
      pageAccessToken: env.META_PAGE_ACCESS_TOKEN,
      publicBaseUrl,
    });
  }
  if (process.env.YOUTUBE_ACCESS_TOKEN) {
    publishers.YT_SHORTS = new YtShortsPublisher({
      accessToken: process.env.YOUTUBE_ACCESS_TOKEN,
      publicBaseUrl,
    });
  }
  if (env.THREADS_MODE === 'real') {
    publishers.THREADS = new ThreadsPublisher({
      threadsClient: container.threadsClient,
      publicBaseUrl,
    });
  }

  const officialProcessor = new OfficialApiPublishProcessor(
    container.publishJobs,
    publishers
  );

  const metaDmWorker = new Worker(
    QUEUE_NAMES.META_AUTO_DM,
    async (job) => {
      const payload = MetaWebhookPayloadSchema.parse(job.data);
      await container.metaAutoDm.processWebhookPayload(payload);
    },
    { connection }
  );

  const officialPublishWorker = new Worker(
    QUEUE_NAMES.OFFICIAL_API_PUBLISH,
    async (job) => {
      const payload = PublishJobPayloadSchema.parse(job.data);
      if (publishers[payload.platform]) {
        return officialProcessor.process(payload);
      }
      return container.publishJobs.updatePublishJob(payload.publishJobId, {
        status: 'PUBLISHED',
        publishedAt: new Date().toISOString(),
      });
    },
    { connection }
  );

  const oauthRefreshWorker = new Worker(
    QUEUE_NAMES.OAUTH_TOKEN_REFRESH,
    async () => {
      const encryptionKeyHex = process.env.TOKEN_ENCRYPTION_KEY;
      if (!container.oauthTokens || !encryptionKeyHex) {
        return { skipped: true, checkedAt: new Date().toISOString() };
      }
      const service = new OAuthTokenRefreshService({
        repo: container.oauthTokens,
        encryptionKeyHex,
        metaAppId: process.env.META_APP_ID,
        metaAppSecret: env.META_APP_SECRET,
        youtubeClientId: process.env.YOUTUBE_CLIENT_ID,
        youtubeClientSecret: process.env.YOUTUBE_CLIENT_SECRET,
        lnkBioClientId: env.LNKBIO_CLIENT_ID,
        lnkBioClientSecret: env.LNKBIO_CLIENT_SECRET,
      });
      const summary = await service.refreshExpiringTokens(14);
      if (summary.reauthRequiredIds.length > 0) {
        await container.telegramAlerts.sendAlert({
          severity: 'CRITICAL',
          title: 'OAuth Token Membutuhkan Re-otorisasi',
          body: `Token ID gagal refresh: ${summary.reauthRequiredIds.join(', ')}`,
        });
      }
      return summary;
    },
    { connection }
  );

  const weeklyEvalWorker = new Worker(
    QUEUE_NAMES.WEEKLY_EVALUATION,
    async () => {
      const report = await container.analytics.getLatestWeeklyEvaluation();
      await container.telegramAlerts.sendAlert({
        severity: 'INFO',
        title: 'Sunday Evaluation Matrix Siap',
        body: `Total ${report.items.length} produk dievaluasi untuk periode minggu ini.`,
      });
      return { evaluatedCount: report.items.length };
    },
    { connection }
  );

  const lnkBioSyncWorker = new Worker(
    QUEUE_NAMES.LNKBIO_METRICS_SYNC,
    async () => container.lnkBioAutomation.syncRemoteLinksAndMetrics(),
    { connection }
  );

  const workers = [
    metaDmWorker,
    officialPublishWorker,
    oauthRefreshWorker,
    weeklyEvalWorker,
    lnkBioSyncWorker,
  ];

  for (const worker of workers) {
    worker.on('failed', (job, err) => {
      void container.telegramAlerts.notifyJobFailed(
        worker.name,
        job?.id ?? 'unknown',
        err.message
      );
    });
  }

  return {
    workers,
    close: async () => {
      await Promise.all(workers.map((w) => w.close()));
    },
  };
}
