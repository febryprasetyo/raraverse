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
  META_APP_SECRET: z.string().optional(),
  META_WEBHOOK_VERIFY_TOKEN: z.string().optional(),
  META_OWN_IG_USER_ID: z.string().optional(),
  META_OWN_PAGE_ID: z.string().optional(),
  META_PAGE_ACCESS_TOKEN: z.string().optional(),
  KALODATA_API_KEY: z.string().optional(),
  KALODATA_BASE_URL: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  R2_ENDPOINT: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_PUBLIC_BASE_URL: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_ADMIN_CHAT_ID: z.string().optional(),
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
  META_APP_SECRET: string;
  META_WEBHOOK_VERIFY_TOKEN: string;
  META_OWN_IG_USER_ID?: string;
  META_OWN_PAGE_ID?: string;
  META_PAGE_ACCESS_TOKEN?: string;
  KALODATA_API_KEY?: string;
  KALODATA_BASE_URL?: string;
  GEMINI_API_KEY?: string;
  OPENAI_API_KEY?: string;
  R2_ENDPOINT?: string;
  R2_BUCKET?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  R2_PUBLIC_BASE_URL?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_ADMIN_CHAT_ID?: string;
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
    META_APP_SECRET: parsed.META_APP_SECRET ?? 'dev-meta-app-secret',
    META_WEBHOOK_VERIFY_TOKEN:
      parsed.META_WEBHOOK_VERIFY_TOKEN ?? 'dev-meta-verify-token',
    META_OWN_IG_USER_ID: parsed.META_OWN_IG_USER_ID,
    META_OWN_PAGE_ID: parsed.META_OWN_PAGE_ID,
    META_PAGE_ACCESS_TOKEN: parsed.META_PAGE_ACCESS_TOKEN,
    KALODATA_API_KEY: parsed.KALODATA_API_KEY,
    KALODATA_BASE_URL: parsed.KALODATA_BASE_URL,
    GEMINI_API_KEY: parsed.GEMINI_API_KEY,
    OPENAI_API_KEY: parsed.OPENAI_API_KEY,
    R2_ENDPOINT: parsed.R2_ENDPOINT,
    R2_BUCKET: parsed.R2_BUCKET,
    R2_ACCESS_KEY_ID: parsed.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: parsed.R2_SECRET_ACCESS_KEY,
    R2_PUBLIC_BASE_URL: parsed.R2_PUBLIC_BASE_URL,
    TELEGRAM_BOT_TOKEN: parsed.TELEGRAM_BOT_TOKEN,
    TELEGRAM_ADMIN_CHAT_ID: parsed.TELEGRAM_ADMIN_CHAT_ID,
  };
}
