'use client';

import {
  ArrowUpRight,
  Check,
  Copy,
  Film,
  Search,
} from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import type {
  ContentAsset,
  DmLog,
  Product,
  PublishJobRecord,
  TargetPlatform,
  WeeklyEvaluationReport,
  WeeklyRecommendation,
} from '@ebieshop/shared';
import { AnalyticsMatrix } from '@/components/analytics-matrix';
import {
  PerformanceChart,
  type PerformancePoint,
} from '@/components/revenlo/performance-chart';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader } from '@/components/ui/card';
import { StatePanel } from '@/components/ui/state-panel';

export interface OverviewData {
  products: Product[];
  assets: ContentAsset[];
  jobs: PublishJobRecord[];
  dmLogs: DmLog[];
  weekly?: WeeklyEvaluationReport | null;
}

type DateRange = 'Hari Ini' | '7D' | '30D' | 'YTD';
type OverviewTab = 'live' | 'analytics';

const RANGE_MULTIPLIER: Record<DateRange, number> = {
  'Hari Ini': 0.18,
  '7D': 1,
  '30D': 3.8,
  YTD: 11.5,
};

const PLATFORM_LABELS: Record<TargetPlatform, string> = {
  IG_REELS: 'Instagram Reels',
  FB_REELS: 'Facebook Reels',
  YT_SHORTS: 'YouTube Shorts',
  SHOPEE_VIDEO: 'Shopee Video',
  TIKTOK_STUDIO: 'TikTok Studio',
  THREADS: 'Threads',
};

export function DashboardOverviewContent({
  state,
  data,
  errorMsg,
  onRetry,
  initialTab = 'live',
  onApplyRecommendation,
}: {
  state: 'loading' | 'empty' | 'error' | 'success';
  data: OverviewData | null;
  errorMsg?: string;
  onRetry?: () => void;
  initialTab?: OverviewTab;
  onApplyRecommendation?: (
    productId: string,
    recommendation: WeeklyRecommendation
  ) => Promise<void>;
}) {
  const [activeTab, setActiveTab] = useState<OverviewTab>(initialTab);
  const [dateRange, setDateRange] = useState<DateRange>('7D');
  const [platformFilter, setPlatformFilter] = useState<'ALL' | TargetPlatform>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'revenue' | 'clicks'>('revenue');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const platformBreakdown = useMemo(() => {
    const counts: Record<TargetPlatform, number> = {
      IG_REELS: 0,
      FB_REELS: 0,
      YT_SHORTS: 0,
      SHOPEE_VIDEO: 0,
      TIKTOK_STUDIO: 0,
      THREADS: 0,
    };
    if (!data) return counts;

    for (const job of data.jobs) {
      counts[job.platform] += 1;
    }
    for (const log of data.dmLogs) {
      counts[log.platform] += 1;
    }
    return counts;
  }, [data]);

  const totalPlatformEvents = useMemo(
    () => Object.values(platformBreakdown).reduce((a, b) => a + b, 0),
    [platformBreakdown]
  );

  const filterFactor = useMemo(() => {
    const rangeMul = RANGE_MULTIPLIER[dateRange];
    if (platformFilter === 'ALL' || totalPlatformEvents === 0) {
      return rangeMul;
    }
    const share = platformBreakdown[platformFilter] / totalPlatformEvents;
    return rangeMul * Math.max(0.15, share);
  }, [dateRange, platformFilter, platformBreakdown, totalPlatformEvents]);

  const metrics = useMemo(() => {
    if (!data) {
      return {
        estCommissionIdr: 0,
        estClicks: 0,
        autoDmSent: 0,
        estConversions: 0,
        publishedVideos: 0,
        queuedVideos: 0,
      };
    }

    const baseCommission =
      data.weekly?.items.reduce((sum, i) => sum + i.estimatedCommissionIdr, 0) ??
      data.products.reduce(
        (sum, p) => sum + Math.round(p.priceIdr * (p.commissionRatePct / 100) * 12),
        0
      );
    const baseClicks =
      data.weekly?.items.reduce((sum, i) => sum + i.estimatedClicks, 0) ??
      Math.max(data.dmLogs.length * 14, data.products.length * 42);

    const estCommissionIdr = Math.round(baseCommission * filterFactor);
    const estClicks = Math.max(0, Math.round(baseClicks * filterFactor));
    const autoDmSent = data.dmLogs.filter((d) => d.dmSent).length;
    const estConversions = Math.max(0, Math.round(estClicks * 0.084));
    const publishedVideos = data.jobs.filter((j) => j.status === 'PUBLISHED').length;
    const queuedVideos = data.jobs.filter((j) => j.status === 'QUEUED').length;

    return {
      estCommissionIdr,
      estClicks,
      autoDmSent,
      estConversions,
      publishedVideos,
      queuedVideos,
    };
  }, [data, filterFactor]);

  const chartSeries: PerformancePoint[] = useMemo(() => {
    const labels = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
    const weights = [0.11, 0.13, 0.12, 0.15, 0.16, 0.18, 0.15];
    return labels.map((label, idx) => {
      const w = weights[idx]!;
      return {
        label,
        revenueIdr: Math.round(metrics.estCommissionIdr * w),
        clicks: Math.round(metrics.estClicks * w),
        conversions: Math.round(metrics.estConversions * w),
      };
    });
  }, [metrics]);

  const campaignRows = useMemo(() => {
    if (!data) return [];
    const weeklyByProd = new Map(
      (data.weekly?.items ?? []).map((item) => [item.productId, item])
    );

    return data.products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(searchQuery.trim().toLowerCase()) ||
          p.triggerKeyword.toLowerCase().includes(searchQuery.trim().toLowerCase())
      )
      .map((product) => {
        const weekly = weeklyByProd.get(product.id);
        const clicks = Math.round((weekly?.estimatedClicks ?? 48) * filterFactor);
        const dmCount = data.dmLogs.filter(
          (d) => d.productId === product.id && d.dmSent
        ).length;
        const revenueIdr = Math.round(
          (weekly?.estimatedCommissionIdr ?? product.priceIdr * 3) * filterFactor
        );
        const shortlink =
          product.affiliateUrls.shopeeShortlink ??
          product.affiliateUrls.tiktokShortlink ??
          product.affiliateUrls.biolinkAnchorUrl ??
          `https://desty.page/ebieshop#${product.biolinkNumber}`;
        return {
          product,
          clicks,
          dmCount,
          revenueIdr,
          shortlink,
        };
      })
      .sort((a, b) =>
        sortBy === 'revenue' ? b.revenueIdr - a.revenueIdr : b.clicks - a.clicks
      );
  }, [data, searchQuery, sortBy, filterFactor]);

  async function handleCopy(id: string, url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // Ignore clipboard errors in headless environments
    }
  }

  if (state === 'loading') {
    return (
      <StatePanel
        status="loading"
        title="Memuat analitik EBIESHOP..."
        description="Mengambil data produk, video, Auto-DM, dan estimasi komisi."
      />
    );
  }

  if (state === 'error') {
    return (
      <StatePanel
        status="error"
        title="Gagal memuat data dashboard"
        description={errorMsg ?? 'Periksa koneksi ke backend API.'}
        onRetry={onRetry}
      />
    );
  }

  if (state === 'empty' || !data) {
    return (
      <StatePanel
        status="empty"
        title="Belum ada produk atau kampanye aktif"
        description="Mulai dengan sinkronisasi produk dari Kalodata di menu Produk & Kampanye."
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Overview Sub-Tabs */}
      <div
        role="tablist"
        aria-label="Tampilan Overview"
        className="inline-flex rounded-full border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-1 shadow-sm"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'live'}
          onClick={() => setActiveTab('live')}
          className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${
            activeTab === 'live'
              ? 'bg-slate-900 text-white shadow-sm dark:bg-emerald-600'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          Analitik Live
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'analytics'}
          onClick={() => setActiveTab('analytics')}
          className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${
            activeTab === 'analytics'
              ? 'bg-slate-900 text-white shadow-sm dark:bg-emerald-600'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          Evaluasi Mingguan
        </button>
      </div>

      {activeTab === 'analytics' ? (
        <AnalyticsMatrix
          report={data.weekly ?? null}
          loading={false}
          onRetry={onRetry ?? (() => {})}
          onApplyRecommendation={
            onApplyRecommendation ?? (async () => {})
          }
        />
      ) : (
        <>
          {/* Global Filter Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-4 py-3">
            <div
              className="flex flex-wrap items-center gap-1.5"
              role="group"
              aria-label="Rentang waktu"
            >
              {(['Hari Ini', '7D', '30D', 'YTD'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setDateRange(r)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    dateRange === r
                      ? 'bg-slate-900 text-white dark:bg-emerald-600'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <label className="sr-only" htmlFor="filter-platform">
                Filter Platform Sosial Media
              </label>
              <select
                id="filter-platform"
                value={platformFilter}
                onChange={(e) =>
                  setPlatformFilter(e.target.value as 'ALL' | TargetPlatform)
                }
                className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-primary)]"
              >
                <option value="ALL">Semua Platform</option>
                {(Object.keys(PLATFORM_LABELS) as TargetPlatform[]).map((p) => (
                  <option key={p} value={p}>
                    {PLATFORM_LABELS[p]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* KPI Summary Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 p-6 text-white shadow-[0_12px_32px_rgba(15,23,42,0.14)]">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-slate-300">
                  Estimasi Komisi
                </p>
                <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300">
                  Shopee / TikTok
                </span>
              </div>
              <p className="tabular-nums mt-3 text-2xl font-bold tracking-tight text-white">
                Rp{metrics.estCommissionIdr.toLocaleString('id-ID')}
              </p>
              <p className="mt-1.5 text-[11px] text-slate-300">
                Akumulasi estimasi periode {dateRange}
              </p>
            </div>

            <Card>
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-[var(--text-muted)]">
                  Estimasi Klik Shortlink
                </p>
                <Badge tone="info">{metrics.autoDmSent} DM Terkirim</Badge>
              </div>
              <p className="tabular-nums mt-2 text-2xl font-bold tracking-tight text-[var(--text-primary)]">
                {metrics.estClicks.toLocaleString('id-ID')}
              </p>
              <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                Dari Auto-DM & klik Biolink
              </p>
            </Card>

            <Card>
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-[var(--text-muted)]">
                  Estimasi Konversi
                </p>
                <Badge tone="neutral">~8.4% CR</Badge>
              </div>
              <p className="tabular-nums mt-2 text-2xl font-bold tracking-tight text-[var(--text-primary)]">
                {metrics.estConversions.toLocaleString('id-ID')}
              </p>
              <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                Checkout produk affiliate
              </p>
            </Card>

            <Card>
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-[var(--text-muted)]">
                  Video Terpublikasi
                </p>
                <Film className="h-4 w-4 text-emerald-600" aria-hidden="true" />
              </div>
              <p className="tabular-nums mt-2 text-2xl font-bold tracking-tight text-[var(--text-primary)]">
                {metrics.publishedVideos}
              </p>
              <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                {metrics.queuedVideos} video dalam antrean jadwal
              </p>
            </Card>
          </div>

          {/* Chart + Real Platform Distribution */}
          <div className="grid gap-6 lg:grid-cols-12">
            <PerformanceChart series={chartSeries} rangeLabel={dateRange} />

            <Card className="space-y-4 lg:col-span-4">
              <CardHeader
                title="Distribusi Platform"
                subtitle="Aktivitas publish & Auto-DM per kanal"
              />
              <div className="space-y-3">
                {(Object.keys(PLATFORM_LABELS) as TargetPlatform[]).map((platform) => {
                  const count = platformBreakdown[platform];
                  const pct =
                    totalPlatformEvents > 0
                      ? Math.round((count / totalPlatformEvents) * 100)
                      : 0;
                  const selected = platformFilter === platform;
                  return (
                    <button
                      key={platform}
                      type="button"
                      onClick={() =>
                        setPlatformFilter(selected ? 'ALL' : platform)
                      }
                      className="block w-full text-left"
                    >
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span
                          className={`font-medium ${
                            selected
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-[var(--text-primary)]'
                          }`}
                        >
                          {PLATFORM_LABELS[platform]}
                        </span>
                        <span className="tabular-nums text-[var(--text-muted)]">
                          {count} ({pct}%)
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-subtle)]">
                        <div
                          className={`h-full rounded-full ${
                            selected
                              ? 'bg-emerald-600'
                              : 'bg-slate-800 dark:bg-slate-300'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            </Card>
          </div>

          {/* Campaign / Product Table */}
          <Card>
            <CardHeader
              title="Performa Produk & Link Affiliate"
              subtitle="Salin shortlink resmi atau pantau estimasi komisi per produk"
              action={
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-[var(--text-muted)]"
                      aria-hidden="true"
                    />
                    <input
                      type="search"
                      aria-label="Cari produk atau keyword"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Cari produk / keyword..."
                      className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] py-1.5 pl-8 pr-3 text-xs text-[var(--text-primary)] placeholder-slate-400 focus:border-slate-900 focus:outline-none"
                    />
                  </div>
                  <select
                    aria-label="Urutkan produk"
                    value={sortBy}
                    onChange={(e) =>
                      setSortBy(e.target.value as 'revenue' | 'clicks')
                    }
                    className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-2.5 py-1.5 text-xs text-[var(--text-primary)]"
                  >
                    <option value="revenue">Komisi Tertinggi</option>
                    <option value="clicks">Klik Terbanyak</option>
                  </select>
                  <Link
                    href="/products"
                    className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-hairline)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]"
                  >
                    Kelola
                    <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                </div>
              }
            />

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-[var(--border-hairline)] text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    <th className="py-2.5 pr-4">Produk / Kampanye</th>
                    <th className="py-2.5 pr-4">Shortlink Resmi</th>
                    <th className="py-2.5 pr-4">Status</th>
                    <th className="py-2.5 pr-4 text-right">Auto-DM</th>
                    <th className="py-2.5 pr-4 text-right">Est. Klik</th>
                    <th className="py-2.5 text-right">Est. Komisi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-hairline)]">
                  {campaignRows.map((row) => (
                    <tr
                      key={row.product.id}
                      className="hover:bg-[var(--bg-subtle)]/40"
                    >
                      <td className="py-3 pr-4">
                        <p className="font-semibold text-[var(--text-primary)]">
                          {row.product.name}
                        </p>
                        <p className="text-[11px] text-[var(--text-muted)]">
                          Keyword:{' '}
                          <span className="font-mono text-emerald-700 dark:text-emerald-400">
                            {row.product.triggerKeyword}
                          </span>{' '}
                          • Biolink #{row.product.biolinkNumber}
                        </p>
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-1.5">
                          <span className="max-w-[165px] truncate font-mono text-[11px] text-[var(--text-secondary)]">
                            {row.shortlink}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              void handleCopy(row.product.id, row.shortlink)
                            }
                            aria-label={`Salin tautan ${row.product.triggerKeyword}`}
                            className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]"
                          >
                            {copiedId === row.product.id ? (
                              <Check className="h-3.5 w-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <Badge
                          tone={row.product.status === 'ACTIVE' ? 'success' : 'info'}
                        >
                          {row.product.status}
                        </Badge>
                      </td>
                      <td className="tabular-nums py-3 pr-4 text-right text-[var(--text-primary)]">
                        {row.dmCount}
                      </td>
                      <td className="tabular-nums py-3 pr-4 text-right text-[var(--text-primary)]">
                        {row.clicks.toLocaleString('id-ID')}
                      </td>
                      <td className="tabular-nums py-3 text-right font-semibold text-[var(--text-primary)]">
                        Rp{row.revenueIdr.toLocaleString('id-ID')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
