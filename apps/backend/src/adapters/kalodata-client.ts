import {
  KalodataCandidateSchema,
  type KalodataCandidate,
  type KalodataCategory,
  type KalodataVideoDetail,
} from '@ebieshop/shared';
import { AppError } from '../errors.js';
import type { IKalodataClient, KalodataFilterInput } from './contracts.js';

export interface KalodataHttpClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetchFn?: typeof fetch;
  retryDelayMs?: number;
  videoEnrichDelayMs?: number;
  maxVideoEnrichProducts?: number;
}

interface RawKalodataCategory {
  category_id?: string | number;
  category_name?: string;
}

interface RawKalodataItem {
  // Kalodata Open Center API v1 (/openapi/v1/tiktok/product/rank)
  product_id?: string;
  product_name?: string;
  unit_price?: number;
  revenue?: number;
  commission_rate?: number;
  revenue_growth_rate?: number;
  sales_volumn?: number;
  live_revenue?: number;
  video_revenue?: number;
  showcase_revenue?: number;
  launch_date?: string;
  seller_id?: string | number;
  seller_name?: string;
  sku_count?: string | number;
  pri_category?: RawKalodataCategory;
  sec_category?: RawKalodataCategory;
  ter_category?: RawKalodataCategory;
  master_image_url?: string | null;
  image_url?: string | null;
  // Legacy / test fixture fields
  id?: string;
  title?: string;
  category?: string;
  price_idr?: number;
  rating?: number;
  commission_rate_pct?: number;
  is_commission_xtra?: boolean;
  is_official_store?: boolean;
  weekly_revenue_idr?: number;
  weekly_units_sold?: number;
  reference_video_urls?: string[];
}

interface ProductRankResponse {
  success?: boolean;
  data?: RawKalodataItem[];
  message?: string | null;
  code?: string | null;
}

interface RawKalodataVideoItem {
  video_id?: string;
  video_title?: string;
  belonged_creator_id?: string | number;
  belonged_creator_handle?: string;
  revenue?: number;
  views?: number;
  revenue_growth_rate?: number;
  ads_roas?: number;
  digg_count?: number;
  share_count?: number;
  comment_count?: number;
  ad_revenue_ratio?: number;
  ad_view_ratio?: number;
  creator_debut?: string;
  ad?: number;
  ai_video?: number;
  publish_date?: string;
}

interface VideoRankResponse {
  success?: boolean;
  data?: RawKalodataVideoItem[];
}

const DEFAULT_KALODATA_BASE_URL = 'https://www.kalodata.com';
const RETRYABLE_GATEWAY_STATUSES = new Set([502, 503, 504, 524, 554]);
const MAX_REQUEST_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 1000;
const DEFAULT_MAX_VIDEO_ENRICH_PRODUCTS = 50;

function mapCategory(raw?: RawKalodataCategory): KalodataCategory | undefined {
  const categoryName = raw?.category_name?.trim();
  const categoryId =
    raw?.category_id !== undefined && raw?.category_id !== null
      ? String(raw.category_id).trim()
      : '';
  if (!categoryId && !categoryName) {
    return undefined;
  }
  return {
    categoryId: categoryId || 'unknown',
    categoryName: categoryName || categoryId,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeKalodataBaseUrl(baseUrl?: string): string {
  const trimmed = baseUrl?.trim();
  const resolved =
    !trimmed || trimmed.includes('api.kalodata.com')
      ? DEFAULT_KALODATA_BASE_URL
      : trimmed;
  return resolved.replace(/\/+$/, '').replace(/\/openapi\/v1$/i, '');
}

function toValidHttpUrl(raw?: string | null): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return undefined;
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? trimmed : undefined;
  } catch {
    return undefined;
  }
}

export class KalodataHttpClient implements IKalodataClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;
  private readonly retryDelayMs: number;
  private readonly videoEnrichDelayMs: number;
  private readonly maxVideoEnrichProducts: number;

  constructor(options: KalodataHttpClientOptions) {
    if (!options.apiKey) {
      throw new Error('KALODATA_API_KEY is required for KalodataHttpClient');
    }
    this.apiKey = options.apiKey;
    this.baseUrl = normalizeKalodataBaseUrl(options.baseUrl);
    this.fetchFn = options.fetchFn ?? fetch;
    this.retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
    this.videoEnrichDelayMs =
      options.videoEnrichDelayMs ?? (process.env.NODE_ENV === 'test' ? 0 : 1050);
    this.maxVideoEnrichProducts =
      options.maxVideoEnrichProducts ?? DEFAULT_MAX_VIDEO_ENRICH_PRODUCTS;
  }

  private async postProductRank(
    requestBody: Record<string, unknown>
  ): Promise<ProductRankResponse> {
    const url = `${this.baseUrl}/openapi/v1/tiktok/product/rank`;

    for (let attempt = 1; attempt <= MAX_REQUEST_ATTEMPTS; attempt += 1) {
      let response: Response;
      try {
        response = await this.fetchFn(url, {
          method: 'POST',
          headers: {
            'secret-key': this.apiKey,
            'Content-Type': 'application/json;charset=utf-8',
            Accept: 'application/json',
          },
          body: JSON.stringify(requestBody),
        });
      } catch (error) {
        if (attempt < MAX_REQUEST_ATTEMPTS) {
          if (this.retryDelayMs > 0) {
            await sleep(this.retryDelayMs);
          }
          continue;
        }
        const reason = error instanceof Error ? error.message : String(error);
        throw new AppError(502, `Kalodata API request failed: ${reason}`);
      }

      if (!response.ok) {
        const bodyText = await response.text().catch(() => '');
        if (
          RETRYABLE_GATEWAY_STATUSES.has(response.status) &&
          attempt < MAX_REQUEST_ATTEMPTS
        ) {
          if (this.retryDelayMs > 0) {
            await sleep(this.retryDelayMs);
          }
          continue;
        }
        throw new AppError(
          response.status === 429 ? 429 : 502,
          `Kalodata API error (${response.status} ${response.statusText}): ${bodyText}`
        );
      }

      let payload: ProductRankResponse;
      try {
        payload = (await response.json()) as ProductRankResponse;
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new AppError(502, `Kalodata API returned invalid JSON: ${reason}`);
      }

      if (payload.success === false) {
        throw new AppError(
          502,
          `Kalodata API error: ${payload.message || payload.code || 'Request rejected'}`
        );
      }

      return payload;
    }

    throw new AppError(502, 'Kalodata API request failed after retries');
  }

  private async fetchTopProductVideos(
    kalodataProductId: string
  ): Promise<{ urls: string[]; videos: KalodataVideoDetail[] }> {
    try {
      const response = await this.fetchFn(
        `${this.baseUrl}/openapi/v1/tiktok/video/rank`,
        {
          method: 'POST',
          headers: {
            'secret-key': this.apiKey,
            'Content-Type': 'application/json;charset=utf-8',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            region: 'ID',
            language: 'id-ID',
            currency: 'IDR',
            date_range: 'last7Day',
            product_id: kalodataProductId,
            page_size: 3,
            page_number: 1,
          }),
        }
      );
      if (!response.ok) {
        return { urls: [], videos: [] };
      }
      const payload = (await response.json()) as VideoRankResponse;
      if (payload.success === false || !Array.isArray(payload.data)) {
        return { urls: [], videos: [] };
      }

      const urls: string[] = [];
      const videos: KalodataVideoDetail[] = [];
      for (const video of payload.data) {
        const videoId = String(video.video_id ?? '').trim();
        if (!videoId) {
          continue;
        }
        const handle = video.belonged_creator_handle?.trim().replace(/^@/, '');
        const videoUrl = handle
          ? `https://www.tiktok.com/@${encodeURIComponent(handle)}/video/${encodeURIComponent(videoId)}`
          : `https://www.tiktok.com/video/${encodeURIComponent(videoId)}`;
        urls.push(videoUrl);
        videos.push({
          videoId,
          ...(video.video_title !== undefined ? { videoTitle: video.video_title } : {}),
          ...(video.belonged_creator_id !== undefined && video.belonged_creator_id !== null
            ? { belongedCreatorId: String(video.belonged_creator_id) }
            : {}),
          ...(handle ? { belongedCreatorHandle: handle } : {}),
          videoUrl,
          ...(typeof video.revenue === 'number' && Number.isFinite(video.revenue)
            ? { revenue: video.revenue }
            : {}),
          ...(typeof video.views === 'number' && Number.isFinite(video.views)
            ? { views: Math.max(0, Math.round(video.views)) }
            : {}),
          ...(typeof video.revenue_growth_rate === 'number' &&
          Number.isFinite(video.revenue_growth_rate)
            ? { revenueGrowthRate: video.revenue_growth_rate }
            : {}),
          ...(typeof video.ads_roas === 'number' && Number.isFinite(video.ads_roas)
            ? { adsRoas: video.ads_roas }
            : {}),
          ...(typeof video.digg_count === 'number' && Number.isFinite(video.digg_count)
            ? { diggCount: Math.max(0, Math.round(video.digg_count)) }
            : {}),
          ...(typeof video.share_count === 'number' && Number.isFinite(video.share_count)
            ? { shareCount: Math.max(0, Math.round(video.share_count)) }
            : {}),
          ...(typeof video.comment_count === 'number' && Number.isFinite(video.comment_count)
            ? { commentCount: Math.max(0, Math.round(video.comment_count)) }
            : {}),
          ...(typeof video.ad_revenue_ratio === 'number' &&
          Number.isFinite(video.ad_revenue_ratio)
            ? { adRevenueRatio: video.ad_revenue_ratio }
            : {}),
          ...(typeof video.ad_view_ratio === 'number' && Number.isFinite(video.ad_view_ratio)
            ? { adViewRatio: video.ad_view_ratio }
            : {}),
          ...(video.creator_debut ? { creatorDebut: video.creator_debut } : {}),
          ...(typeof video.ad === 'number' && Number.isFinite(video.ad)
            ? { ad: Math.round(video.ad) }
            : {}),
          ...(typeof video.ai_video === 'number' && Number.isFinite(video.ai_video)
            ? { aiVideo: Math.round(video.ai_video) }
            : {}),
          ...(video.publish_date ? { publishDate: video.publish_date } : {}),
        });
      }
      return { urls, videos };
    } catch {
      return { urls: [], videos: [] };
    }
  }

  async fetchWinningCandidates(filter: KalodataFilterInput): Promise<KalodataCandidate[]> {
    const keyword = filter.niche.replace(/_/g, ' ').trim();
    const requestBody = {
      region: 'ID',
      language: 'id-ID',
      currency: 'IDR',
      date_range: 'last7Day',
      sort_field: { field: 'revenue', type: 'DESC' as const },
      page_size: Math.min(Math.max(filter.limit * 2, 15), 50),
      page_number: 1,
      is_affiliate: 1,
      keyword,
      need_image: 1,
      need_extra: true,
    };

    const payload = await this.postProductRank(requestBody);

    const rawItems = Array.isArray(payload.data) ? payload.data : [];

    const candidates: KalodataCandidate[] = [];
    for (const item of rawItems) {
      const kalodataProductId = (item.product_id ?? item.id ?? '').trim();
      const rawName = (item.product_name ?? item.title ?? '').trim();
      const rawPrice = item.unit_price ?? item.price_idr;
      if (!kalodataProductId || !rawName || typeof rawPrice !== 'number' || !Number.isFinite(rawPrice)) {
        continue;
      }

      const priceIdr = Math.round(rawPrice);
      if (priceIdr <= 0 || priceIdr > filter.maxPriceIdr) {
        continue;
      }

      const rating =
        typeof item.rating === 'number' && Number.isFinite(item.rating)
          ? Number(item.rating.toFixed(2))
          : Math.max(Number(filter.minRating.toFixed(2)), 4.8);
      if (rating < filter.minRating) {
        continue;
      }

      const rawCommission = item.commission_rate ?? item.commission_rate_pct ?? 0;
      const commissionRatePct = Math.min(
        100,
        Math.max(0, Number(Number(rawCommission).toFixed(2)))
      );
      const rawRevenue = item.revenue ?? item.weekly_revenue_idr ?? 0;
      const rawUnitsSold = item.sales_volumn ?? item.weekly_units_sold ?? 0;
      const imageUrl = toValidHttpUrl(item.master_image_url ?? item.image_url);
      const priCategory = mapCategory(item.pri_category);
      const secCategory = mapCategory(item.sec_category);
      const terCategory = mapCategory(item.ter_category);

      const parsed = KalodataCandidateSchema.safeParse({
        kalodataProductId,
        name: rawName.slice(0, 255),
        niche: (item.category ?? filter.niche).trim().slice(0, 100),
        priceIdr,
        rating,
        commissionRatePct,
        isCommissionXtra: item.is_commission_xtra ?? commissionRatePct >= 8,
        isOfficialStore:
          item.is_official_store ??
          Boolean(item.seller_name && /official/i.test(item.seller_name)),
        ...(imageUrl ? { imageUrl } : {}),
        weeklyRevenueIdr: Math.max(0, Math.round(rawRevenue)),
        weeklyUnitsSold: Math.max(0, Math.round(rawUnitsSold)),
        referenceVideoUrls: item.reference_video_urls ?? [],
        unitPriceExactIdr: Math.max(0, rawPrice),
        revenueExactIdr: Math.max(0, rawRevenue),
        ...(typeof item.revenue_growth_rate === 'number' &&
        Number.isFinite(item.revenue_growth_rate)
          ? { revenueGrowthRatePct: item.revenue_growth_rate }
          : {}),
        ...(typeof item.live_revenue === 'number' && Number.isFinite(item.live_revenue)
          ? { liveRevenueIdr: Math.max(0, item.live_revenue) }
          : {}),
        ...(typeof item.video_revenue === 'number' && Number.isFinite(item.video_revenue)
          ? { videoRevenueIdr: Math.max(0, item.video_revenue) }
          : {}),
        ...(typeof item.showcase_revenue === 'number' &&
        Number.isFinite(item.showcase_revenue)
          ? { showcaseRevenueIdr: Math.max(0, item.showcase_revenue) }
          : {}),
        ...(item.launch_date ? { launchDate: item.launch_date } : {}),
        ...(item.seller_id !== undefined && item.seller_id !== null
          ? { sellerId: String(item.seller_id) }
          : {}),
        ...(item.seller_name ? { sellerName: item.seller_name.trim() } : {}),
        ...(item.sku_count !== undefined && item.sku_count !== null
          ? { skuCount: String(item.sku_count) }
          : {}),
        ...(priCategory ? { priCategory } : {}),
        ...(secCategory ? { secCategory } : {}),
        ...(terCategory ? { terCategory } : {}),
        referenceVideos: [],
      });

      if (parsed.success) {
        candidates.push(parsed.data);
      }
    }

    const selected = candidates.slice(0, filter.limit);
    const enrichLimit = Math.min(selected.length, this.maxVideoEnrichProducts);
    for (let i = 0; i < enrichLimit; i += 1) {
      const candidate = selected[i]!;
      if (candidate.referenceVideoUrls.length > 0 && candidate.referenceVideos.length > 0) {
        continue;
      }
      if (i > 0 && this.videoEnrichDelayMs > 0) {
        await sleep(this.videoEnrichDelayMs);
      }
      const { urls, videos } = await this.fetchTopProductVideos(candidate.kalodataProductId);
      if (urls.length > 0 || videos.length > 0) {
        selected[i] = {
          ...candidate,
          referenceVideoUrls:
            candidate.referenceVideoUrls.length > 0 ? candidate.referenceVideoUrls : urls,
          referenceVideos: videos,
        };
      }
    }

    return selected;
  }
}
