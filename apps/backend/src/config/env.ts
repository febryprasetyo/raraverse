import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { z } from 'zod';
import { resolveDataSourceMode } from '@ebieshop/mocks';
import type { DataSourceMode } from '@ebieshop/shared';

function nonEmpty(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Loads local .env.development entries into targetEnv (only for non-production runs)
 * while preserving literal '#' and '$' characters inside unquoted secret values.
 */
export function loadLocalDevEnvInto(
  targetEnv: Record<string, string | undefined>
): void {
  if (targetEnv.NODE_ENV !== 'development') {
    return;
  }

  const candidates = [
    resolvePath(process.cwd(), '.env.development'),
    resolvePath(process.cwd(), '../../.env.development'),
    '/app/.env.development',
  ];

  const envFilePath = candidates.find((p) => existsSync(p));
  if (!envFilePath) {
    return;
  }

  const rawContent = readFileSync(envFilePath, 'utf-8');
  for (const rawLine of rawContent.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const eqIndex = line.indexOf('=');
    if (eqIndex <= 0) {
      continue;
    }
    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }

    if (
      !nonEmpty(targetEnv[key]) ||
      /^LNK_?BIO_CLIENT_(ID|SECRE?ET)$/i.test(key) ||
      /^TH?READS_(APP_ID|APP_SECRET|DISPLAY_NAME|USER_ID|ACCESS_TOKEN|REDIRECT_URI|MODE)$/i.test(
        key
      ) ||
      key === 'PUBLIC_REDIRECT_BASE_URL'
    ) {
      targetEnv[key] = value;
    }
  }
}

export function resolveTokenEncryptionKey(env: Pick<EnvConfig, 'NODE_ENV' | 'ADMIN_JWT_SECRET' | 'TOKEN_ENCRYPTION_KEY'>): string | undefined {
  const explicit = nonEmpty(env.TOKEN_ENCRYPTION_KEY ?? process.env.TOKEN_ENCRYPTION_KEY);
  if (explicit && /^[0-9a-f]{64}$/i.test(explicit)) {
    return explicit;
  }
  if (env.NODE_ENV !== 'production') {
    return createHash('sha256').update(env.ADMIN_JWT_SECRET).digest('hex');
  }
  return explicit;
}

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
  LNKBIO_MODE: z.string().optional(),
  LNKBIO_CLIENT_ID: z.string().optional(),
  LNK_BIO_CLIENT_ID: z.string().optional(),
  LNKBIO_CLIENT_SECRET: z.string().optional(),
  LNK_BIO_CLIENT_SECRET: z.string().optional(),
  LNKBIO_CLIENT_SCREET: z.string().optional(),
  LNK_BIO_CLIENT_SCREET: z.string().optional(),
  LNKBIO_REDIRECT_URI: z.string().optional(),
  LNKBIO_ACCESS_TOKEN: z.string().optional(),
  LNK_BIO_ACCESS_TOKEN: z.string().optional(),
  LNKBIO_GROUP_ID: z.string().optional(),
  LNK_BIO_GROUP_ID: z.string().optional(),
  THREADS_MODE: z.string().optional(),
  THREADS_APP_ID: z.string().optional(),
  TREADS_APP_ID: z.string().optional(),
  THREADS_APP_SECRET: z.string().optional(),
  TREADS_APP_SECRET: z.string().optional(),
  THREADS_DISPLAY_NAME: z.string().optional(),
  TREADS_DISPLAY_NAME: z.string().optional(),
  THREADS_USER_ID: z.string().optional(),
  TREADS_USER_ID: z.string().optional(),
  THREADS_ACCESS_TOKEN: z.string().optional(),
  TREADS_ACCESS_TOKEN: z.string().optional(),
  THREADS_REDIRECT_URI: z.string().optional(),
  TREADS_REDIRECT_URI: z.string().optional(),
  PUBLIC_REDIRECT_BASE_URL: z.string().optional(),
  TOKEN_ENCRYPTION_KEY: z.string().optional(),
  CORS_ORIGIN: z.string().optional(),
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
  LNKBIO_MODE: DataSourceMode;
  LNKBIO_CLIENT_ID?: string;
  LNKBIO_CLIENT_SECRET?: string;
  LNKBIO_REDIRECT_URI?: string;
  LNKBIO_ACCESS_TOKEN?: string;
  LNKBIO_GROUP_ID?: string;
  THREADS_MODE: DataSourceMode;
  THREADS_APP_ID?: string;
  THREADS_APP_SECRET?: string;
  THREADS_DISPLAY_NAME?: string;
  THREADS_USER_ID?: string;
  THREADS_ACCESS_TOKEN?: string;
  THREADS_REDIRECT_URI?: string;
  PUBLIC_REDIRECT_BASE_URL?: string;
  TOKEN_ENCRYPTION_KEY?: string;
  CORS_ORIGIN?: string;
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
    LNKBIO_MODE: resolve(parsed.LNKBIO_MODE),
    LNKBIO_CLIENT_ID:
      nonEmpty(parsed.LNKBIO_CLIENT_ID) ?? nonEmpty(parsed.LNK_BIO_CLIENT_ID),
    LNKBIO_CLIENT_SECRET:
      nonEmpty(parsed.LNKBIO_CLIENT_SECRET) ??
      nonEmpty(parsed.LNK_BIO_CLIENT_SECRET) ??
      nonEmpty(parsed.LNKBIO_CLIENT_SCREET) ??
      nonEmpty(parsed.LNK_BIO_CLIENT_SCREET),
    LNKBIO_REDIRECT_URI: nonEmpty(parsed.LNKBIO_REDIRECT_URI),
    LNKBIO_ACCESS_TOKEN:
      nonEmpty(parsed.LNKBIO_ACCESS_TOKEN) ?? nonEmpty(parsed.LNK_BIO_ACCESS_TOKEN),
    LNKBIO_GROUP_ID:
      nonEmpty(parsed.LNKBIO_GROUP_ID) ?? nonEmpty(parsed.LNK_BIO_GROUP_ID),
    THREADS_MODE: resolve(parsed.THREADS_MODE),
    THREADS_APP_ID:
      nonEmpty(parsed.THREADS_APP_ID) ?? nonEmpty(parsed.TREADS_APP_ID),
    THREADS_APP_SECRET:
      nonEmpty(parsed.THREADS_APP_SECRET) ?? nonEmpty(parsed.TREADS_APP_SECRET),
    THREADS_DISPLAY_NAME:
      nonEmpty(parsed.THREADS_DISPLAY_NAME) ?? nonEmpty(parsed.TREADS_DISPLAY_NAME),
    THREADS_USER_ID:
      nonEmpty(parsed.THREADS_USER_ID) ?? nonEmpty(parsed.TREADS_USER_ID),
    THREADS_ACCESS_TOKEN:
      nonEmpty(parsed.THREADS_ACCESS_TOKEN) ?? nonEmpty(parsed.TREADS_ACCESS_TOKEN),
    THREADS_REDIRECT_URI:
      nonEmpty(parsed.THREADS_REDIRECT_URI) ?? nonEmpty(parsed.TREADS_REDIRECT_URI),
    PUBLIC_REDIRECT_BASE_URL: nonEmpty(parsed.PUBLIC_REDIRECT_BASE_URL),
    TOKEN_ENCRYPTION_KEY: nonEmpty(parsed.TOKEN_ENCRYPTION_KEY),
    CORS_ORIGIN: parsed.CORS_ORIGIN,
  };
}
