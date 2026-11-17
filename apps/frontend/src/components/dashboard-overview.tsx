'use client';

import Link from 'next/link';
import type { ContentAsset, DmLog, Product, PublishJobRecord } from '@ebieshop/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader } from '@/components/ui/card';
import { StatePanel } from '@/components/ui/state-panel';

export interface OverviewData {
  products: Product[];
  assets: ContentAsset[];
  jobs: PublishJobRecord[];
  dmLogs: DmLog[];
}

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
  if (state === 'loading') {
    return (
      <StatePanel
        status="loading"
        title="Memuat ringkasan dashboard..."
        description="Mengambil data produk, konten, antrean publish, dan Auto-DM."
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
        title="Belum ada produk terkurasi"
        description="Mulai dengan sinkronisasi kandidat produk dari Kalodata di menu Produk."
      />
    );
  }

  const activeProducts = data.products.filter((p) => p.status === 'ACTIVE').length;
  const pendingReview = data.assets.filter((a) => a.status === 'PENDING_REVIEW').length;
  const publishedJobs = data.jobs.filter((j) => j.status === 'PUBLISHED').length;
  const sentDms = data.dmLogs.filter((d) => d.dmSent).length;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <p className="text-xs font-medium text-slate-400">Produk Aktif</p>
          <p className="mt-2 text-2xl font-bold text-white">{activeProducts}</p>
          <p className="mt-1 text-xs text-emerald-400">
            Total {data.products.length} produk terdaftar
          </p>
        </Card>
        <Card>
          <p className="text-xs font-medium text-slate-400">Menunggu Review</p>
          <p className="mt-2 text-2xl font-bold text-white">{pendingReview}</p>
          <p className="mt-1 text-xs text-amber-300">
            Dari {data.assets.length} aset video 9:16
          </p>
        </Card>
        <Card>
          <p className="text-xs font-medium text-slate-400">Terpublikasi</p>
          <p className="mt-2 text-2xl font-bold text-white">{publishedJobs}</p>
          <p className="mt-1 text-xs text-sky-300">
            Total {data.jobs.length} jadwal lintas platform
          </p>
        </Card>
        <Card>
          <p className="text-xs font-medium text-slate-400">Auto-DM Terkirim</p>
          <p className="mt-2 text-2xl font-bold text-white">{sentDms}</p>
          <p className="mt-1 text-xs text-emerald-400">
            Dari {data.dmLogs.length} komentar masuk
          </p>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Produk Prioritas"
          subtitle="Produk aktif dan terkurasi siap produksi konten"
          action={
            <Link
              href="/products"
              className="text-xs font-semibold text-emerald-400 hover:text-emerald-300"
            >
              Kelola Semua →
            </Link>
          }
        />
        <div className="divide-y divide-slate-800">
          {data.products.slice(0, 5).map((product) => (
            <div
              key={product.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <div>
                <p className="text-sm font-medium text-white">{product.name}</p>
                <p className="text-xs text-slate-400">
                  Keyword:{' '}
                  <span className="font-mono text-emerald-300">
                    {product.triggerKeyword}
                  </span>{' '}
                  • Biolink #{product.biolinkNumber} • Rp
                  {product.priceIdr.toLocaleString('id-ID')}
                </p>
              </div>
              <Badge tone={product.status === 'ACTIVE' ? 'success' : 'info'}>
                {product.status}
              </Badge>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
