import { z } from 'zod';
import { resolveDataSourceMode } from '@ebieshop/mocks';
import type { DataSourceMode } from '@ebieshop/shared';

const EnvInputSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  DATA_SOURCE_MODE: z.string().default('mock'),
  KALODATA_MODE: z.string().optional(),
  LLM_MODE: z.string().optional(),
  TTS_MODE: z.string().optional(),
  META_API_MODE: z.string().optional(),
  ADMIN_JWT_SECRET: z.string().min(16),
  WORKER_SHARED_SECRET: z.string().min(16),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  SKIP_QUEUE_CONNECTION: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

export interface EnvConfig {
  NODE_ENV: 'development' | 'test' | 'production';
  PORT: number;
  DATA_SOURCE_MODE: DataSourceMode;
  KALODATA_MODE: DataSourceMode;
  LLM_MODE: DataSourceMode;
  TTS_MODE: DataSourceMode;
  META_API_MODE: DataSourceMode;
  ADMIN_JWT_SECRET: string;
  WORKER_SHARED_SECRET: string;
  DATABASE_URL: string;
  REDIS_URL: string;
  SKIP_QUEUE_CONNECTION: boolean;
}

export function loadEnvConfig(rawEnv: Record<string, string | undefined>): EnvConfig {
  const parsed = EnvInputSchema.parse(rawEnv);

  if (parsed.NODE_ENV === 'production' && parsed.SKIP_QUEUE_CONNECTION) {
    throw new Error('SKIP_QUEUE_CONNECTION=true is forbidden in production.');
  }

  const resolve = (serviceOverride?: string) =>
    resolveDataSourceMode({
      nodeEnv: parsed.NODE_ENV,
      globalMode: parsed.DATA_SOURCE_MODE,
      serviceOverride,
    });

  return {
    NODE_ENV: parsed.NODE_ENV,
    PORT: parsed.PORT,
    DATA_SOURCE_MODE: resolve(),
    KALODATA_MODE: resolve(parsed.KALODATA_MODE),
    LLM_MODE: resolve(parsed.LLM_MODE),
    TTS_MODE: resolve(parsed.TTS_MODE),
    META_API_MODE: resolve(parsed.META_API_MODE),
    ADMIN_JWT_SECRET: parsed.ADMIN_JWT_SECRET,
    WORKER_SHARED_SECRET: parsed.WORKER_SHARED_SECRET,
    DATABASE_URL: parsed.DATABASE_URL,
    REDIS_URL: parsed.REDIS_URL,
    SKIP_QUEUE_CONNECTION: parsed.SKIP_QUEUE_CONNECTION,
  };
}
