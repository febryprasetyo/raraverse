import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

export const QUEUE_NAMES = {
  SCRIPT_GENERATION: 'script-generation',
  LOCAL_VIDEO_RENDER: 'local-video-render',
  OFFICIAL_API_PUBLISH: 'official-api-publish',
  LOCAL_PLAYWRIGHT_PUBLISH: 'local-playwright-publish',
  META_AUTO_DM: 'meta-auto-dm',
  OAUTH_TOKEN_REFRESH: 'oauth-token-refresh',
  WEEKLY_EVALUATION: 'weekly-evaluation',
} as const;

export interface QueueRegistry {
  connection: Redis;
  queues: Record<keyof typeof QUEUE_NAMES, Queue>;
  close: () => Promise<void>;
}

export function createQueueRegistry(redisUrl: string): QueueRegistry {
  const connection = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
  });

  const queues = {
    SCRIPT_GENERATION: new Queue(QUEUE_NAMES.SCRIPT_GENERATION, { connection }),
    LOCAL_VIDEO_RENDER: new Queue(QUEUE_NAMES.LOCAL_VIDEO_RENDER, { connection }),
    OFFICIAL_API_PUBLISH: new Queue(QUEUE_NAMES.OFFICIAL_API_PUBLISH, { connection }),
    LOCAL_PLAYWRIGHT_PUBLISH: new Queue(QUEUE_NAMES.LOCAL_PLAYWRIGHT_PUBLISH, {
      connection,
    }),
    META_AUTO_DM: new Queue(QUEUE_NAMES.META_AUTO_DM, { connection }),
    OAUTH_TOKEN_REFRESH: new Queue(QUEUE_NAMES.OAUTH_TOKEN_REFRESH, { connection }),
    WEEKLY_EVALUATION: new Queue(QUEUE_NAMES.WEEKLY_EVALUATION, { connection }),
  };

  return {
    connection,
    queues,
    close: async () => {
      await Promise.all(Object.values(queues).map((q) => q.close()));
      await connection.quit();
    },
  };
}
