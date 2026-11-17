import { z } from 'zod';
import { resolveDataSourceMode } from '@ebieshop/mocks';
import type { DataSourceMode } from '@ebieshop/shared';

const WorkerEnvInputSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATA_SOURCE_MODE: z.string().default('mock'),
  TTS_MODE: z.string().optional(),
  VPS_API_URL: z.string().url(),
  WORKER_SHARED_SECRET: z.string().min(16),
  REDIS_URL: z.string().min(1),
  RAW_MEDIA_DIR: z.string().min(1).default('./raw_media_dir'),
  PLAYWRIGHT_HEADLESS: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
});

export interface WorkerEnvConfig {
  NODE_ENV: 'development' | 'test' | 'production';
  DATA_SOURCE_MODE: DataSourceMode;
  TTS_MODE: DataSourceMode;
  VPS_API_URL: string;
  WORKER_SHARED_SECRET: string;
  REDIS_URL: string;
  RAW_MEDIA_DIR: string;
  PLAYWRIGHT_HEADLESS: boolean;
}

export function loadWorkerEnvConfig(
  rawEnv: Record<string, string | undefined>
): WorkerEnvConfig {
  const parsed = WorkerEnvInputSchema.parse(rawEnv);

  return {
    NODE_ENV: parsed.NODE_ENV,
    DATA_SOURCE_MODE: resolveDataSourceMode({
      nodeEnv: parsed.NODE_ENV,
      globalMode: parsed.DATA_SOURCE_MODE,
    }),
    TTS_MODE: resolveDataSourceMode({
      nodeEnv: parsed.NODE_ENV,
      globalMode: parsed.DATA_SOURCE_MODE,
      serviceOverride: parsed.TTS_MODE,
    }),
    VPS_API_URL: parsed.VPS_API_URL,
    WORKER_SHARED_SECRET: parsed.WORKER_SHARED_SECRET,
    REDIS_URL: parsed.REDIS_URL,
    RAW_MEDIA_DIR: parsed.RAW_MEDIA_DIR,
    PLAYWRIGHT_HEADLESS: parsed.PLAYWRIGHT_HEADLESS,
  };
}
