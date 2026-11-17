import { KalodataCandidateSchema, type KalodataCandidate } from '@ebieshop/shared';
import type { IKalodataClient, KalodataFilterInput } from './contracts.js';

export interface KalodataHttpClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

interface RawKalodataItem {
  id: string;
  title: string;
  category: string;
  price_idr: number;
  rating: number;
  commission_rate_pct: number;
  is_commission_xtra?: boolean;
  is_official_store?: boolean;
  weekly_revenue_idr?: number;
  weekly_units_sold?: number;
  reference_video_urls?: string[];
}

export class KalodataHttpClient implements IKalodataClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: KalodataHttpClientOptions) {
    if (!options.apiKey) {
      throw new Error('KALODATA_API_KEY is required for KalodataHttpClient');
    }
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? 'https://api.kalodata.com/v1').replace(/\/$/, '');
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async fetchWinningCandidates(filter: KalodataFilterInput): Promise<KalodataCandidate[]> {
    const params = new URLSearchParams({
      niche: filter.niche,
      max_price_idr: String(filter.maxPriceIdr),
      min_rating: String(filter.minRating),
      limit: String(filter.limit),
    });

    const response = await this.fetchFn(`${this.baseUrl}/products/winning?${params.toString()}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const bodyText = await response.text().catch(() => '');
      throw new Error(
        `Kalodata API error (${response.status} ${response.statusText}): ${bodyText}`
      );
    }

    const payload = (await response.json()) as { data?: RawKalodataItem[] };
    const rawItems = Array.isArray(payload.data) ? payload.data : [];

    const candidates: KalodataCandidate[] = [];
    for (const item of rawItems) {
      if (item.price_idr >= 100000 || item.price_idr > filter.maxPriceIdr) {
        continue;
      }
      if (item.rating < filter.minRating) {
        continue;
      }

      const parsed = KalodataCandidateSchema.safeParse({
        kalodataProductId: item.id,
        name: item.title,
        niche: item.category,
        priceIdr: item.price_idr,
        rating: item.rating,
        commissionRatePct: item.commission_rate_pct,
        isCommissionXtra: Boolean(item.is_commission_xtra),
        isOfficialStore: Boolean(item.is_official_store),
        weeklyRevenueIdr: item.weekly_revenue_idr ?? 0,
        weeklyUnitsSold: item.weekly_units_sold ?? 0,
        referenceVideoUrls: item.reference_video_urls ?? [],
      });

      if (parsed.success) {
        candidates.push(parsed.data);
      }
    }

    return candidates.slice(0, filter.limit);
  }
}
