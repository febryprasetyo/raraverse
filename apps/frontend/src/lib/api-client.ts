import {
  ContentAssetSchema,
  DmLogSchema,
  KalodataCandidateSchema,
  ProductSchema,
  PublishJobRecordSchema,
  WeeklyEvaluationReportSchema,
  type ContentAsset,
  type ContentStatus,
  type DmLog,
  type KalodataCandidate,
  type Product,
  type ProductStatus,
  type PublishJobRecord,
  type TargetPlatform,
  type WeeklyEvaluationReport,
} from '@ebieshop/shared';
import { z } from 'zod';

const ProductsResponseSchema = z.object({ items: z.array(ProductSchema) });
const ProductResponseSchema = z.object({ product: ProductSchema });
const KalodataSyncResponseSchema = z.object({
  syncedCount: z.number().int().nonnegative(),
  candidates: z.array(KalodataCandidateSchema),
});
const ContentAssetsResponseSchema = z.object({ items: z.array(ContentAssetSchema) });
const ContentAssetResponseSchema = z.object({ asset: ContentAssetSchema });
const PublishJobsResponseSchema = z.object({ items: z.array(PublishJobRecordSchema) });
const SchedulePublishResponseSchema = z.object({
  jobs: z.array(PublishJobRecordSchema),
});
const DmLogsResponseSchema = z.object({ items: z.array(DmLogSchema) });

export const SystemHealthSchema = z.object({
  apiStatus: z.literal('OK'),
  dataSourceMode: z.string(),
  workerOnline: z.boolean(),
  lastHeartbeatAt: z.string().datetime(),
  oauthProviders: z.array(
    z.object({
      provider: z.enum(['meta', 'youtube']),
      status: z.enum(['HEALTHY', 'EXPIRING_SOON', 'NEEDS_REAUTH']),
      expiresInDays: z.number().int(),
    })
  ),
  playwrightSessions: z.array(
    z.object({
      platform: z.enum(['SHOPEE_VIDEO', 'TIKTOK_STUDIO']),
      status: z.enum(['READY', 'NEEDS_MANUAL_LOGIN']),
    })
  ),
});

export type SystemHealth = z.infer<typeof SystemHealthSchema>;

export interface ApiClientOptions {
  baseUrl: string;
  token: string;
  fetchImpl?: typeof fetch;
}

export function createBackendClient(options: ApiClientOptions) {
  const fetcher = options.fetchImpl ?? fetch;
  const base = options.baseUrl.replace(/\/$/, '');

  async function requestJson<T>(
    path: string,
    schema: z.ZodType<T, z.ZodTypeDef, unknown>,
    init?: RequestInit
  ): Promise<T> {
    const headers: Record<string, string> = {
      authorization: `Bearer ${options.token}`,
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
    };
    const response = await fetcher(`${base}${path}`, {
      ...init,
      headers: {
        ...headers,
        ...(init?.headers as Record<string, string> | undefined),
      },
    });

    if (!response.ok) {
      throw new Error(`Backend request failed with status ${response.status}`);
    }

    const json: unknown = await response.json();
    return schema.parse(json);
  }

  return {
    async listProducts(status?: ProductStatus): Promise<Product[]> {
      const qs = status ? `?status=${encodeURIComponent(status)}` : '';
      return (await requestJson(`/api/v1/products${qs}`, ProductsResponseSchema)).items;
    },

    async syncKalodata(input: {
      niche: string;
      maxPriceIdr?: number;
      minRating?: number;
      limit?: number;
    }): Promise<{ syncedCount: number; candidates: KalodataCandidate[] }> {
      return requestJson('/api/v1/products/kalodata-sync', KalodataSyncResponseSchema, {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },

    async updateProduct(
      id: string,
      patch: Partial<
        Pick<
          Product,
          | 'name'
          | 'triggerKeyword'
          | 'biolinkNumber'
          | 'affiliateUrls'
          | 'rawMediaDir'
          | 'rawMediaClipCount'
          | 'status'
        >
      >
    ): Promise<Product> {
      return (
        await requestJson(`/api/v1/products/${id}`, ProductResponseSchema, {
          method: 'PATCH',
          body: JSON.stringify(patch),
        })
      ).product;
    },

    async listContentAssets(status?: ContentStatus): Promise<ContentAsset[]> {
      const qs = status ? `?status=${encodeURIComponent(status)}` : '';
      return (await requestJson(`/api/v1/content${qs}`, ContentAssetsResponseSchema)).items;
    },

    async generateContent(input: {
      productId: string;
      angle?: string;
      ttsProvider?: 'edge-tts' | 'elevenlabs';
      ttsVoiceId?: string;
    }): Promise<ContentAsset> {
      return (
        await requestJson('/api/v1/content/generate', ContentAssetResponseSchema, {
          method: 'POST',
          body: JSON.stringify(input),
        })
      ).asset;
    },

    async reviewContent(
      id: string,
      decision: 'APPROVED' | 'REJECTED',
      rejectionReason?: string
    ): Promise<ContentAsset> {
      return (
        await requestJson(`/api/v1/content/${id}/review`, ContentAssetResponseSchema, {
          method: 'PATCH',
          body: JSON.stringify({ decision, rejectionReason }),
        })
      ).asset;
    },

    async deleteContent(id: string): Promise<void> {
      await requestJson(`/api/v1/content/${id}`, z.object({ ok: z.literal(true) }), {
        method: 'DELETE',
      });
    },

    async listPublishJobs(): Promise<PublishJobRecord[]> {
      return (await requestJson('/api/v1/publish-jobs', PublishJobsResponseSchema)).items;
    },

    async schedulePublishJobs(input: {
      contentAssetId: string;
      platforms: TargetPlatform[];
      visibility?: 'PUBLIC' | 'PRIVATE';
    }): Promise<PublishJobRecord[]> {
      return (
        await requestJson('/api/v1/publish-jobs/schedule', SchedulePublishResponseSchema, {
          method: 'POST',
          body: JSON.stringify(input),
        })
      ).jobs;
    },

    async listDmLogs(): Promise<DmLog[]> {
      return (await requestJson('/api/v1/dm-logs', DmLogsResponseSchema)).items;
    },

    async getWeeklyEvaluation(): Promise<WeeklyEvaluationReport> {
      return requestJson('/api/v1/analytics/weekly', WeeklyEvaluationReportSchema);
    },

    async getSystemHealth(): Promise<SystemHealth> {
      return requestJson('/api/v1/system/health', SystemHealthSchema);
    },
  };
}
