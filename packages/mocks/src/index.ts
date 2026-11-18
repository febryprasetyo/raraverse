import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  AffiliateLinkSchema,
  ContentAssetSchema,
  DataSourceModeSchema,
  DmLogSchema,
  KalodataCandidateSchema,
  LnkBioMetricsSnapshotSchema,
  LnkBioSyncLogSchema,
  MetaWebhookPayloadSchema,
  ProductSchema,
  PublishJobRecordSchema,
  ScriptGeneratorOutputSchema,
  ThreadsPostRecordSchema,
  ThreadsSyncLogSchema,
  WeeklyEvaluationReportSchema,
  type AffiliateLink,
  type ContentAsset,
  type DataSourceMode,
  type DmLog,
  type KalodataCandidate,
  type LnkBioMetricsSnapshot,
  type LnkBioSyncLog,
  type MetaWebhookPayload,
  type Product,
  type PublishJobRecord,
  type ScriptGeneratorOutput,
  type ThreadsPostRecord,
  type ThreadsSyncLog,
  type WeeklyEvaluationReport,
} from '@ebieshop/shared';

const CURRENT_DIR = dirname(fileURLToPath(import.meta.url));
export const MOCKS_JSON_DIR = resolve(CURRENT_DIR, '../json');

function loadAndValidateJson<T>(
  filename: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>
): T {
  const filePath = resolve(MOCKS_JSON_DIR, filename);
  const raw = readFileSync(filePath, 'utf-8');
  const parsed: unknown = JSON.parse(raw);
  return schema.parse(parsed);
}

export function loadMockKalodataCandidates(): KalodataCandidate[] {
  return loadAndValidateJson(
    'kalodata-candidates.json',
    z.array(KalodataCandidateSchema)
  );
}

export function loadMockProducts(): Product[] {
  return loadAndValidateJson('products.json', z.array(ProductSchema));
}

export function loadMockScriptGeneratorOutput(): ScriptGeneratorOutput {
  return loadAndValidateJson('script-generator.json', ScriptGeneratorOutputSchema);
}

export function loadMockContentAssets(): ContentAsset[] {
  return loadAndValidateJson('content-assets.json', z.array(ContentAssetSchema));
}

export function loadMockPublishJobs(): PublishJobRecord[] {
  return loadAndValidateJson('publish-jobs.json', z.array(PublishJobRecordSchema));
}

export function loadMockMetaWebhookEvents(): MetaWebhookPayload[] {
  return loadAndValidateJson(
    'meta-webhook-events.json',
    z.array(MetaWebhookPayloadSchema)
  );
}

export function loadMockDmLogs(): DmLog[] {
  return loadAndValidateJson('dm-logs.json', z.array(DmLogSchema));
}

export function loadMockWeeklyEvaluation(): WeeklyEvaluationReport {
  return loadAndValidateJson(
    'weekly-evaluation.json',
    WeeklyEvaluationReportSchema
  );
}

export function loadMockAffiliateLinks(): AffiliateLink[] {
  return loadAndValidateJson(
    'affiliate-links.json',
    z.array(AffiliateLinkSchema)
  );
}

export function loadMockLnkBioSyncLogs(): LnkBioSyncLog[] {
  return loadAndValidateJson(
    'lnk-bio-sync-logs.json',
    z.array(LnkBioSyncLogSchema)
  );
}

export function loadMockLnkBioMetricsSnapshots(): LnkBioMetricsSnapshot[] {
  return loadAndValidateJson(
    'lnk-bio-metrics-snapshots.json',
    z.array(LnkBioMetricsSnapshotSchema)
  );
}

export function loadMockThreadsPosts(): ThreadsPostRecord[] {
  return loadAndValidateJson(
    'threads-posts.json',
    z.array(ThreadsPostRecordSchema)
  );
}

export function loadMockThreadsSyncLogs(): ThreadsSyncLog[] {
  return loadAndValidateJson(
    'threads-sync-logs.json',
    z.array(ThreadsSyncLogSchema)
  );
}

export interface ResolveModeOptions {
  nodeEnv?: string;
  globalMode?: string;
  serviceOverride?: string;
  allowMockInProduction?: boolean;
}

/**
 * Resolves whether an adapter uses local JSON mocks or live API/DB.
 * Fails fast in production if mock mode is active without explicit override.
 */
export function resolveDataSourceMode(options: ResolveModeOptions): DataSourceMode {
  const candidate = options.serviceOverride ?? options.globalMode ?? 'mock';
  const mode = DataSourceModeSchema.parse(candidate);

  if (
    options.nodeEnv === 'production' &&
    mode === 'mock' &&
    !options.allowMockInProduction
  ) {
    throw new Error(
      'DATA_SOURCE_MODE=mock is forbidden in production. Set DATA_SOURCE_MODE=real.'
    );
  }

  return mode;
}
