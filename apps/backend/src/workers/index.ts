import { Worker } from 'bullmq';
import {
  MetaWebhookPayloadSchema,
  PublishJobPayloadSchema,
} from '@ebieshop/shared';
import type { AppContainer } from '../container.js';
import { QUEUE_NAMES, type QueueRegistry } from '../queues/registry.js';
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
}

export function startBackendWorkers(
  container: AppContainer,
  registry: QueueRegistry
): BackendWorkerRuntime {
  const { connection } = registry;

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
      await container.publishJobs.updatePublishJob(payload.publishJobId, {
        status: 'PUBLISHED',
        publishedAt: new Date().toISOString(),
      });
    },
    { connection }
  );

  const oauthRefreshWorker = new Worker(
    QUEUE_NAMES.OAUTH_TOKEN_REFRESH,
    async () => {
      // Triggered weekly; in real mode uses OAuthTokenRefreshService with Drizzle token repo
      return { checkedAt: new Date().toISOString() };
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

  const workers = [
    metaDmWorker,
    officialPublishWorker,
    oauthRefreshWorker,
    weeklyEvalWorker,
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
