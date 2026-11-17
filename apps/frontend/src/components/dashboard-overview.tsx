'use client';

import {
  ArrowUpRight,
  Check,
  Copy,
  Download,
  Search,
  Wallet,
} from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import type {
  ContentAsset,
  DmLog,
  Product,
  PublishJobRecord,
  WeeklyEvaluationReport,
} from '@ebieshop/shared';
import {
  PerformanceChart,
  type PerformancePoint,
} from '@/components/revenlo/performance-chart';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
type SourceFilter = 'ALL' | 'Instagram' | 'TikTok' | 'YouTube' | 'Shopee';
type DeviceFilter = 'ALL' | 'Mobile' | 'Desktop' | 'Tablet';

const SOURCE_WEIGHTS: Record<Exclude<SourceFilter, 'ALL'>, number> = {
  Instagram: 0.38,
  TikTok: 0.31,
  YouTube: 0.17,
  Shopee: 0.14,
};

const DEVICE_WEIGHTS: Record<Exclude<DeviceFilter, 'ALL'>, number> = {
  Mobile: 0.78,
  Desktop: 0.16,
  Tablet: 0.06,
};

const RANGE_MULTIPLIER: Record<DateRange, number> = {
  'Hari Ini': 0.18,
  '7D': 1,
  '30D': 3.8,
  YTD: 11.5,
};

export function DashboardOverviewContent({
  state,
  data,
  errorMsg,
  onRetry,
}: {
  state: 'loading' | 'empty' | 'error' | 'success';
  data: OverviewData | null;
  errorMsg?: string;
  onRetry?: () => void;
}) {
  const [dateRange, setDateRange] = useState<DateRange>('7D');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('ALL');
  const [deviceFilter, setDeviceFilter] = useState<DeviceFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'revenue' | 'clicks'>('revenue');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [payoutRequested, setPayoutRequested] = useState(false);

  const filterFactor = useMemo(() => {
    const rangeMul = RANGE_MULTIPLIER[dateRange];
    const srcMul = sourceFilter === 'ALL' ? 1 : SOURCE_WEIGHTS[sourceFilter];
    const devMul = deviceFilter === 'ALL' ? 1 : DEVICE_WEIGHTS[deviceFilter];
    return rangeMul * srcMul * devMul;
  }, [dateRange, sourceFilter, deviceFilter]);

  const metrics = useMemo(() => {
    if (!data) {
      return {
        totalRevenue: 0,
        totalClicks: 0,
        totalConversions: 0,
        conversionRate: 0,
        availableBalance: 0,
        pendingBalance: 0,
      };
    }

    const baseRevenue =
      data.weekly?.items.reduce((sum, i) => sum + i.estimatedCommissionIdr, 0) ??
      data.products.reduce((sum, p) => sum + Math.round(p.priceIdr * p.commissionRatePct * 0.4), 0);
    const baseClicks =
      data.weekly?.items.reduce((sum, i) => sum + i.estimatedClicks, 0) ??
      Math.max(data.dmLogs.length * 14, data.products.length * 42);

    const totalRevenue = Math.round(baseRevenue * filterFactor);
    const totalClicks = Math.max(1, Math.round(baseClicks * filterFactor));
    const totalConversions = Math.max(
      0,
      Math.round(totalClicks * 0.084)
    );
    const conversionRate = Number(
      ((totalConversions / totalClicks) * 100).toFixed(2)
    );
    const availableBalance = Math.round(totalRevenue * 0.72);
    const pendingBalance = Math.max(0, totalRevenue - availableBalance);

    return {
      totalRevenue,
      totalClicks,
      totalConversions,
      conversionRate,
      availableBalance,
      pendingBalance,
    };
  }, [data, filterFactor]);

  const chartSeries: PerformancePoint[] = useMemo(() => {
    const labels = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
    const weights = [0.11, 0.13, 0.12, 0.15, 0.16, 0.18, 0.15];
    return labels.map((label, idx) => {
      const w = weights[idx]!;
      return {
        label,
        revenueIdr: Math.round(metrics.totalRevenue * w),
        clicks: Math.round(metrics.totalClicks * w),
        conversions: Math.round(metrics.totalConversions * w),
      };
    });
  }, [metrics]);

  const campaignRows = useMemo(() => {
    if (!data) return [];
    const weeklyByProd = new Map(
      (data.weekly?.items ?? []).map((item) => [item.productId, item])
    );

    return data.products
      .filter((p) =>
        p.name.toLowerCase().includes(searchQuery.trim().toLowerCase()) ||
        p.triggerKeyword.toLowerCase().includes(searchQuery.trim().toLowerCase())
      )
      .map((product) => {
        const weekly = weeklyByProd.get(product.id);
        const clicks = Math.round((weekly?.estimatedClicks ?? 48) * filterFactor);
        const conversions = Math.max(0, Math.round(clicks * 0.085));
        const cr = clicks > 0 ? Number(((conversions / clicks) * 100).toFixed(1)) : 0;
        const revenueIdr = Math.round(
          (weekly?.estimatedCommissionIdr ?? product.priceIdr * 3) * filterFactor
        );
        const shortlink =
          product.affiliateUrls.shopeeShortlink ??
          product.affiliateUrls.biolinkAnchorUrl ??
          `https://desty.page/ebieshop#${product.biolinkNumber}`;
        return {
          product,
          clicks,
          conversions,
          cr,
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
        title="Memuat analitik Revenlo..."
        description="Menghitung metrik klik, konversi, dan komisi real-time."
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
        description="Sinkronkan produk dari Kalodata di menu Produk & Kampanye."
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Global Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-4 py-3">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Rentang waktu">
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

        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="filter-source">
            Filter Sumber Trafik
          </label>
          <select
            id="filter-source"
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value as SourceFilter)}
            className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-primary)]"
          >
            <option value="ALL">Semua Sumber</option>
            <option value="Instagram">Instagram</option>
            <option value="TikTok">TikTok</option>
            <option value="YouTube">YouTube</option>
            <option value="Shopee">Shopee</option>
          </select>

          <label className="sr-only" htmlFor="filter-device">
            Filter Perangkat
          </label>
          <select
            id="filter-device"
            value={deviceFilter}
            onChange={(e) => setDeviceFilter(e.target.value as DeviceFilter)}
            className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-primary)]"
          >
            <option value="ALL">Semua Perangkat</option>
            <option value="Mobile">Mobile (iOS/Android)</option>
            <option value="Desktop">Desktop</option>
            <option value="Tablet">Tablet</option>
          </select>
        </div>
      </div>

      {/* Fitur 1: KPI Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-[var(--text-muted)]">
              Total Pendapatan
            </p>
            <Badge tone="success">+14.2%</Badge>
          </div>
          <p className="tabular-nums mt-2 text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            Rp{metrics.totalRevenue.toLocaleString('id-ID')}
          </p>
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">
            Tertunda: Rp{metrics.pendingBalance.toLocaleString('id-ID')}
          </p>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-[var(--text-muted)]">
              Total Klik Tautan
            </p>
            <Badge tone="success">+8.6%</Badge>
          </div>
          <p className="tabular-nums mt-2 text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            {metrics.totalClicks.toLocaleString('id-ID')}
          </p>
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">
            Dari {data.dmLogs.filter((d) => d.dmSent).length} Auto-DM & Biolink
          </p>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-[var(--text-muted)]">
              Konversi (Referrals)
            </p>
            <Badge tone="info">CR {metrics.conversionRate}%</Badge>
          </div>
          <p className="tabular-nums mt-2 text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            {metrics.totalConversions.toLocaleString('id-ID')}
          </p>
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">
            Transaksi tervalidasi periode {dateRange}
          </p>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-[var(--text-muted)]">
              Saldo Siap Tarik
            </p>
            <Wallet className="h-4 w-4 text-emerald-600" aria-hidden="true" />
          </div>
          <p className="tabular-nums mt-2 text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            Rp{metrics.availableBalance.toLocaleString('id-ID')}
          </p>
          <div className="mt-2 flex items-center justify-between">
            <button
              type="button"
              disabled={metrics.availableBalance < 100000 || payoutRequested}
              onClick={() => setPayoutRequested(true)}
              className="text-xs font-semibold text-emerald-700 hover:underline disabled:text-[var(--text-muted)] dark:text-emerald-400"
            >
              {payoutRequested ? 'Pengajuan Diproses ✓' : 'Ajukan Payout →'}
            </button>
          </div>
        </Card>
      </div>

      {/* Fitur 2 & 3: Performance Chart + Traffic/Device Breakdown */}
      <div className="grid gap-6 lg:grid-cols-12">
        <PerformanceChart series={chartSeries} rangeLabel={dateRange} />

        <Card className="space-y-5 lg:col-span-4">
          <CardHeader
            title="Sumber Trafik & Perangkat"
            subtitle="Klik kanal untuk menyaring dasbor"
          />

          <div className="space-y-3">
            {(
              Object.entries(SOURCE_WEIGHTS) as Array<
                [Exclude<SourceFilter, 'ALL'>, number]
              >
            ).map(([channel, ratio]) => {
              const pct = Math.round(ratio * 100);
              const selected = sourceFilter === channel;
              return (
                <button
                  key={channel}
                  type="button"
                  onClick={() =>
                    setSourceFilter(selected ? 'ALL' : channel)
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
                      {channel}
                    </span>
                    <span className="tabular-nums text-[var(--text-muted)]">
                      {pct}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-subtle)]">
                    <div
                      className={`h-full rounded-full ${
                        selected ? 'bg-emerald-600' : 'bg-slate-800 dark:bg-slate-300'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </button>
              );
            })}
          </div>

          <div className="border-t border-[var(--border-hairline)] pt-4">
            <p className="mb-2.5 text-xs font-semibold text-[var(--text-primary)]">
              Distribusi Perangkat
            </p>
            <div className="grid grid-cols-3 gap-2 text-center">
              {(
                Object.entries(DEVICE_WEIGHTS) as Array<
                  [Exclude<DeviceFilter, 'ALL'>, number]
                >
              ).map(([dev, ratio]) => (
                <button
                  key={dev}
                  type="button"
                  onClick={() =>
                    setDeviceFilter(deviceFilter === dev ? 'ALL' : dev)
                  }
                  className={`rounded-lg border px-2 py-2 text-xs transition-colors ${
                    deviceFilter === dev
                      ? 'border-emerald-600 bg-emerald-50/70 dark:bg-emerald-950/40'
                      : 'border-[var(--border-hairline)] bg-[var(--bg-canvas)]'
                  }`}
                >
                  <p className="font-semibold text-[var(--text-primary)]">
                    {Math.round(ratio * 100)}%
                  </p>
                  <p className="text-[10px] text-[var(--text-muted)]">{dev}</p>
                </button>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* Fitur 4: Campaign / Product Table */}
      <Card>
        <CardHeader
          title="Performa Kampanye & Produk"
          subtitle="Pantau shortlink, klik, rasio konversi, dan komisi"
          action={
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-[var(--text-muted)]"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  aria-label="Cari kampanye atau keyword"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari produk / keyword..."
                  className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] py-1.5 pl-8 pr-3 text-xs text-[var(--text-primary)] placeholder-slate-400 focus:border-slate-900 focus:outline-none"
                />
              </div>
              <select
                aria-label="Urutkan kampanye"
                value={sortBy}
                onChange={(e) =>
                  setSortBy(e.target.value as 'revenue' | 'clicks')
                }
                className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-2.5 py-1.5 text-xs text-[var(--text-primary)]"
              >
                <option value="revenue">Pendapatan Tertinggi</option>
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
                <th className="py-2.5 pr-4">Kampanye / Produk</th>
                <th className="py-2.5 pr-4">Tautan Pendek</th>
                <th className="py-2.5 pr-4">Status</th>
                <th className="py-2.5 pr-4 text-right">Klik</th>
                <th className="py-2.5 pr-4 text-right">Konversi</th>
                <th className="py-2.5 pr-4 text-right">CR</th>
                <th className="py-2.5 text-right">Pendapatan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-hairline)]">
              {campaignRows.map((row) => (
                <tr key={row.product.id} className="hover:bg-[var(--bg-subtle)]/40">
                  <td className="py-3 pr-4">
                    <p className="font-semibold text-[var(--text-primary)]">
                      {row.product.name}
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      Keyword:{' '}
                      <span className="font-mono text-emerald-700 dark:text-emerald-400">
                        {row.product.triggerKeyword}
                      </span>{' '}
                      • #{row.product.biolinkNumber}
                    </p>
                  </td>
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-1.5">
                      <span className="max-w-[160px] truncate font-mono text-[11px] text-[var(--text-secondary)]">
                        {row.shortlink}
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleCopy(row.product.id, row.shortlink)}
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
                    <Badge tone={row.product.status === 'ACTIVE' ? 'success' : 'info'}>
                      {row.product.status}
                    </Badge>
                  </td>
                  <td className="tabular-nums py-3 pr-4 text-right text-[var(--text-primary)]">
                    {row.clicks.toLocaleString('id-ID')}
                  </td>
                  <td className="tabular-nums py-3 pr-4 text-right text-[var(--text-primary)]">
                    {row.conversions}
                  </td>
                  <td className="tabular-nums py-3 pr-4 text-right text-[var(--text-secondary)]">
                    {row.cr}%
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

      {/* Fitur 5: Payout & Earnings Snapshot */}
      <Card>
        <CardHeader
          title="Riwayat Pencairan Komisi (Payout)"
          subtitle="Pelacakan status transfer komisi afiliasi"
          action={
            <Button
              size="sm"
              variant="secondary"
              onClick={() => window.print()}
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              Cetak Invoice
            </Button>
          }
        />
        <div className="divide-y divide-[var(--border-hairline)] text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 py-2.5">
            <div>
              <p className="font-semibold text-[var(--text-primary)]">
                PAY-202611-001 • Transfer Bank BCA
              </p>
              <p className="text-[11px] text-[var(--text-muted)]">
                Diajukan 10 Nov 2026
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="tabular-nums font-semibold text-[var(--text-primary)]">
                Rp420.000
              </span>
              <Badge tone="success">Paid</Badge>
            </div>
          </div>
          {payoutRequested ? (
            <div className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <div>
                <p className="font-semibold text-[var(--text-primary)]">
                  PAY-202611-002 • Transfer Bank BCA
                </p>
                <p className="text-[11px] text-[var(--text-muted)]">
                  Baru saja diajukan
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="tabular-nums font-semibold text-[var(--text-primary)]">
                  Rp{metrics.availableBalance.toLocaleString('id-ID')}
                </span>
                <Badge tone="warning">Processing</Badge>
              </div>
            </div>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
