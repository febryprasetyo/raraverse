import {
  AffiliateLinkSchema,
  ContentAssetSchema,
  DmLogSchema,
  KalodataCandidateSchema,
  LnkBioAccountProfileSchema,
  LnkBioMetricsSnapshotSchema,
  LnkBioOverviewSchema,
  LnkBioSyncLogSchema,
  ProductSchema,
  PublishJobRecordSchema,
  ThreadsAccountProfileSchema,
  ThreadsMediaTypeSchema,
  ThreadsOverviewSchema,
  ThreadsPostRecordSchema,
  ThreadsSyncLogSchema,
  WeeklyEvaluationReportSchema,
  type AffiliateLink,
  type ContentAsset,
  type ContentStatus,
  type DmLog,
  type KalodataCandidate,
  type LnkBioAccountProfile,
  type LnkBioMetricsSnapshot,
  type LnkBioOverview,
  type LnkBioSyncLog,
  type LnkBioSyncOperation,
  type Product,
  type ProductStatus,
  type PublishJobRecord,
  type TargetPlatform,
  type ThreadsAccountProfile,
  type ThreadsMediaType,
  type ThreadsOverview,
  type ThreadsPostRecord,
  type ThreadsSyncLog,
  type ThreadsSyncOperation,
  type WeeklyEvaluationReport,
} from '@ebieshop/shared';
import { z } from 'zod';

const ProductsResponseSchema = z.object({ items: z.array(ProductSchema) });
const ProductResponseSchema = z.object({ product: ProductSchema });
const KalodataSyncResponseSchema = z.object({
  syncedCount: z.number().int().nonnegative(),
  candidates: z.array(KalodataCandidateSchema),
});
const KalodataSaveResponseSchema = z.object({
  savedCount: z.number().int().nonnegative(),
  items: z.array(ProductSchema),
});
const ContentAssetsResponseSchema = z.object({ items: z.array(ContentAssetSchema) });
const ContentAssetResponseSchema = z.object({ asset: ContentAssetSchema });
const PublishJobsResponseSchema = z.object({ items: z.array(PublishJobRecordSchema) });
const SchedulePublishResponseSchema = z.object({
  jobs: z.array(PublishJobRecordSchema),
});
const DmLogsResponseSchema = z.object({ items: z.array(DmLogSchema) });
const LnkBioLogsResponseSchema = z.object({ items: z.array(LnkBioSyncLogSchema) });
const LnkBioMetricsResponseSchema = z.object({
  items: z.array(LnkBioMetricsSnapshotSchema),
});
const LnkBioPublishResponseSchema = z.object({
  link: AffiliateLinkSchema,
  product: ProductSchema,
});
const LnkBioReorderResponseSchema = z.object({
  reorderedCount: z.number().int().nonnegative(),
  links: z.array(AffiliateLinkSchema),
});
const LnkBioSyncResponseSchema = z.object({
  syncedLinks: z.number().int().nonnegative(),
  groupsCount: z.number().int().nonnegative(),
  snapshotsCreated: z.number().int().nonnegative(),
  profile: LnkBioAccountProfileSchema,
});
const LnkBioConnectResponseSchema = z.object({
  connected: z.literal(true),
  profile: LnkBioAccountProfileSchema,
  expiresAt: z.string().datetime(),
});
const ThreadsConnectResponseSchema = z.object({
  connected: z.literal(true),
  tokenType: z.enum(['USER', 'APP']),
  profile: ThreadsAccountProfileSchema,
  expiresAt: z.string().datetime(),
});
const ThreadsDraftResponseSchema = z.object({
  rootText: z.string(),
  replyText: z.string(),
  affiliateUrl: z.string().url(),
  mediaUrl: z.string().url().nullable(),
  resolvedMediaType: ThreadsMediaTypeSchema,
});
const ThreadsPublishResponseSchema = z.object({
  post: ThreadsPostRecordSchema,
  product: ProductSchema,
});
const ThreadsLogsResponseSchema = z.object({
  items: z.array(ThreadsSyncLogSchema),
});

export const SystemHealthSchema = z.object({
  apiStatus: z.literal('OK'),
  dataSourceMode: z.string(),
  workerOnline: z.boolean(),
  lastHeartbeatAt: z.string().datetime(),
  oauthProviders: z.array(
    z.object({
      provider: z.enum(['meta', 'youtube', 'lnkbio', 'threads']),
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
      const errBody = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      const detail = errBody?.error?.message;
      throw new Error(
        detail
          ? `Backend request failed (${response.status}): ${detail}`
          : `Backend request failed with status ${response.status}`
      );
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
      previewOnly?: boolean;
    }): Promise<{ syncedCount: number; candidates: KalodataCandidate[] }> {
      return requestJson('/api/v1/products/kalodata-sync', KalodataSyncResponseSchema, {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },

    async saveKalodataCandidates(input: {
      niche?: string;
      candidates: KalodataCandidate[];
    }): Promise<{ savedCount: number; items: Product[] }> {
      return requestJson('/api/v1/products/kalodata-save', KalodataSaveResponseSchema, {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },

    async deleteProduct(id: string): Promise<void> {
      await requestJson(`/api/v1/products/${id}`, z.object({ ok: z.literal(true) }), {
        method: 'DELETE',
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

    async syncProductLnkBio(id: string): Promise<Product> {
      return (
        await requestJson(`/api/v1/products/${id}/lnkbio-sync`, ProductResponseSchema, {
          method: 'POST',
        })
      ).product;
    },

    async listContentAssets(status?: ContentStatus): Promise<ContentAsset[]> {
      const qs = status ? `?status=${encodeURIComponent(status)}` : '';
      return (await requestJson(`/api/v1/content${qs}`, ContentAssetsResponseSchema)).items;
    },

    async generateStoryboard(input: {
      productId: string;
      angle?: string;
      ttsProvider?: 'edge-tts' | 'elevenlabs';
      ttsVoiceId?: string;
      storyboardPrompt?: string;
      productImageUrl?: string;
      backgroundImageUrl?: string;
      existingAssetId?: string;
    }): Promise<ContentAsset> {
      return (
        await requestJson('/api/v1/content/storyboard', ContentAssetResponseSchema, {
          method: 'POST',
          body: JSON.stringify(input),
        })
      ).asset;
    },

    async uploadRenderedVideo(
      assetId: string,
      dataUrl: string,
      durationSec = 18
    ): Promise<ContentAsset> {
      return (
        await requestJson(
          `/api/v1/content/${assetId}/upload-video`,
          ContentAssetResponseSchema,
          {
            method: 'POST',
            body: JSON.stringify({ dataUrl, durationSec }),
          }
        )
      ).asset;
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

    async getLnkBioOverview(): Promise<LnkBioOverview> {
      return requestJson('/api/v1/lnkbio/overview', LnkBioOverviewSchema);
    },

    async getLnkBioAuthorizeUrl(
      redirectUri?: string
    ): Promise<{ authorizeUrl: string; state: string }> {
      const qs = redirectUri ? `?redirectUri=${encodeURIComponent(redirectUri)}` : '';
      return requestJson(
        `/api/v1/lnkbio/auth/authorize-url${qs}`,
        z.object({ authorizeUrl: z.string().url(), state: z.string() })
      );
    },

    async connectLnkBioAuth(input?: {
      mode?: 'client_credentials' | 'authorization_code';
      code?: string;
      redirectUri?: string;
    }): Promise<{
      connected: true;
      profile: LnkBioAccountProfile;
      expiresAt: string;
    }> {
      return requestJson('/api/v1/lnkbio/auth/connect', LnkBioConnectResponseSchema, {
        method: 'POST',
        body: JSON.stringify(input ?? { mode: 'client_credentials' }),
      });
    },

    async syncLnkBio(): Promise<{
      syncedLinks: number;
      groupsCount: number;
      snapshotsCreated: number;
      profile: LnkBioAccountProfile;
    }> {
      return requestJson('/api/v1/lnkbio/sync', LnkBioSyncResponseSchema, {
        method: 'POST',
        body: JSON.stringify({}),
      });
    },

    async publishLnkBioProductLink(
      productId: string,
      input?: {
        title?: string;
        groupId?: string | null;
        scheduleFrom?: string | null;
        scheduleTo?: string | null;
        position?: number;
      }
    ): Promise<{ link: AffiliateLink; product: Product }> {
      return requestJson(
        `/api/v1/lnkbio/links/${productId}/publish`,
        LnkBioPublishResponseSchema,
        {
          method: 'POST',
          body: JSON.stringify(input ?? {}),
        }
      );
    },

    async deleteLnkBioProductLink(
      productId: string
    ): Promise<{ deleted: true; productId: string }> {
      return requestJson(
        `/api/v1/lnkbio/links/${productId}`,
        z.object({ deleted: z.literal(true), productId: z.string().uuid() }),
        {
          method: 'DELETE',
        }
      );
    },

    async reorderLnkBioLinks(input: {
      orderedProductIds: string[];
      groupId?: string;
    }): Promise<{ reorderedCount: number; links: AffiliateLink[] }> {
      return requestJson('/api/v1/lnkbio/reorder', LnkBioReorderResponseSchema, {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },

    async listLnkBioLogs(filter?: {
      limit?: number;
      operation?: LnkBioSyncOperation;
      status?: 'SUCCESS' | 'FAILED';
    }): Promise<LnkBioSyncLog[]> {
      const params = new URLSearchParams();
      if (filter?.limit) params.set('limit', String(filter.limit));
      if (filter?.operation) params.set('operation', filter.operation);
      if (filter?.status) params.set('status', filter.status);
      const qs = params.toString() ? `?${params.toString()}` : '';
      return (await requestJson(`/api/v1/lnkbio/logs${qs}`, LnkBioLogsResponseSchema))
        .items;
    },

    async listLnkBioMetrics(filter?: {
      productId?: string;
      limit?: number;
    }): Promise<LnkBioMetricsSnapshot[]> {
      const params = new URLSearchParams();
      if (filter?.productId) params.set('productId', filter.productId);
      if (filter?.limit) params.set('limit', String(filter.limit));
      const qs = params.toString() ? `?${params.toString()}` : '';
      return (
        await requestJson(`/api/v1/lnkbio/metrics${qs}`, LnkBioMetricsResponseSchema)
      ).items;
    },

    async getThreadsOverview(): Promise<ThreadsOverview> {
      return requestJson('/api/v1/threads/overview', ThreadsOverviewSchema);
    },

    async getThreadsAuthorizeUrl(
      redirectUri?: string
    ): Promise<{
      authorizeUrl: string;
      state: string;
      redirectUri: string;
      scopes: string[];
    }> {
      const qs = redirectUri ? `?redirectUri=${encodeURIComponent(redirectUri)}` : '';
      return requestJson(
        `/api/v1/threads/auth/authorize-url${qs}`,
        z.object({
          authorizeUrl: z.string().url(),
          state: z.string(),
          redirectUri: z.string().url(),
          scopes: z.array(z.string()),
        })
      );
    },

    async connectThreadsAuth(input?: {
      mode?: 'authorization_code' | 'client_credentials' | 'access_token';
      code?: string;
      redirectUri?: string;
      accessToken?: string;
    }): Promise<{
      connected: true;
      tokenType: 'USER' | 'APP';
      profile: ThreadsAccountProfile;
      expiresAt: string;
    }> {
      return requestJson('/api/v1/threads/auth/connect', ThreadsConnectResponseSchema, {
        method: 'POST',
        body: JSON.stringify(input ?? { mode: 'client_credentials' }),
      });
    },

    async draftThreadsProductPost(
      productId: string,
      mediaType: ThreadsMediaType = 'TEXT'
    ): Promise<{
      rootText: string;
      replyText: string;
      affiliateUrl: string;
      mediaUrl: string | null;
      resolvedMediaType: ThreadsMediaType;
    }> {
      return requestJson(
        `/api/v1/threads/posts/${productId}/draft`,
        ThreadsDraftResponseSchema,
        {
          method: 'POST',
          body: JSON.stringify({ mediaType }),
        }
      );
    },

    async publishThreadsProductPost(
      productId: string,
      input?: {
        mediaType?: ThreadsMediaType;
        rootText?: string;
        replyText?: string;
        mediaUrl?: string;
      }
    ): Promise<{ post: ThreadsPostRecord; product: Product }> {
      return requestJson(
        `/api/v1/threads/posts/${productId}/publish`,
        ThreadsPublishResponseSchema,
        {
          method: 'POST',
          body: JSON.stringify(input ?? {}),
        }
      );
    },

    async listThreadsLogs(filter?: {
      limit?: number;
      operation?: ThreadsSyncOperation;
      status?: 'SUCCESS' | 'FAILED';
    }): Promise<ThreadsSyncLog[]> {
      const params = new URLSearchParams();
      if (filter?.limit) params.set('limit', String(filter.limit));
      if (filter?.operation) params.set('operation', filter.operation);
      if (filter?.status) params.set('status', filter.status);
      const qs = params.toString() ? `?${params.toString()}` : '';
      return (await requestJson(`/api/v1/threads/logs${qs}`, ThreadsLogsResponseSchema))
        .items;
    },
  };
}
