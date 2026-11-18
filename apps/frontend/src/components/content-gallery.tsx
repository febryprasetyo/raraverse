'use client';

import { Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { ContentAsset, ContentStatus, Product } from '@ebieshop/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { StatePanel } from '@/components/ui/state-panel';

export interface ContentGalleryProps {
  assets: ContentAsset[];
  products: Product[];
  loading: boolean;
  errorMsg?: string;
  onRetry: () => void;
  onReview: (id: string, decision: 'APPROVED' | 'REJECTED') => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

const STATUS_FILTERS: Array<'ALL' | ContentStatus> = [
  'ALL',
  'PENDING_REVIEW',
  'APPROVED',
  'RENDERING_VIDEO',
  'REJECTED',
];

function resolveVideoUrl(videoR2Key: string): string {
  if (process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL) {
    return `${process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL.replace(/\/$/, '')}/${videoR2Key}`;
  }
  const apiBase = (
    process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3001'
  ).replace(/\/$/, '');
  return `${apiBase}/api/v1/assets/local-file/${videoR2Key}`;
}

export function ContentGallery({
  assets,
  products,
  loading,
  errorMsg,
  onRetry,
  onReview,
  onDelete,
}: ContentGalleryProps) {
  const [filter, setFilter] = useState<'ALL' | ContentStatus>('ALL');
  const [busyId, setBusyId] = useState<string | null>(null);

  const productMap = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products]
  );

  const visibleAssets =
    filter === 'ALL' ? assets : assets.filter((a) => a.status === filter);

  async function handleAction(id: string, fn: () => Promise<void>) {
    setBusyId(id);
    try {
      await fn();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="Filter status aset konten"
        >
          {STATUS_FILTERS.map((s) => (
            <Button
              key={s}
              size="sm"
              variant={filter === s ? 'primary' : 'secondary'}
              onClick={() => setFilter(s)}
            >
              {s}
            </Button>
          ))}
        </div>
        <Link
          href="/studio"
          className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-500"
        >
          + Buat Konten Baru
        </Link>
      </div>

      {loading ? (
        <StatePanel status="loading" title="Memuat galeri video..." />
      ) : errorMsg ? (
        <StatePanel
          status="error"
          title="Gagal memuat galeri konten"
          description={errorMsg}
          onRetry={onRetry}
        />
      ) : visibleAssets.length === 0 ? (
        <StatePanel
          status="empty"
          title="Galeri konten masih kosong"
          description="Generate konten baru dari Content Studio agar hasil render 9:16 muncul di sini."
        />
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visibleAssets.map((asset) => {
            const product = productMap.get(asset.productId);
            const isBusy = busyId === asset.id;

            return (
              <Card key={asset.id} className="flex flex-col gap-4 p-4">
                <div className="relative aspect-[9/16] w-full overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
                  {asset.videoR2Key ? (
                    <video
                      src={resolveVideoUrl(asset.videoR2Key)}
                      controls
                      playsInline
                      preload="metadata"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center p-4 text-center">
                      <p className="text-xs font-semibold uppercase tracking-widest text-emerald-400">
                        {asset.status}
                      </p>
                      <p className="mt-2 text-xs text-slate-300">
                        {asset.scriptJson.hook}
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex-1 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Badge
                      tone={
                        asset.status === 'APPROVED'
                          ? 'success'
                          : asset.status === 'REJECTED' || asset.status === 'FAILED'
                            ? 'danger'
                            : 'info'
                      }
                    >
                      {asset.status}
                    </Badge>
                    {asset.durationSec ? (
                      <span className="tabular-nums text-[11px] text-[var(--text-muted)]">
                        {asset.durationSec.toFixed(1)}s
                      </span>
                    ) : null}
                  </div>
                  <p className="line-clamp-2 text-sm font-semibold text-[var(--text-primary)]">
                    {asset.scriptJson.hook}
                  </p>
                  <p className="truncate text-xs text-[var(--text-muted)]">
                    {product ? `${product.triggerKeyword} — ${product.name}` : asset.productId}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border-hairline)] pt-3">
                  {asset.status !== 'APPROVED' ? (
                    <Button
                      size="sm"
                      disabled={isBusy}
                      onClick={() =>
                        void handleAction(asset.id, () =>
                          onReview(asset.id, 'APPROVED')
                        )
                      }
                    >
                      Approve
                    </Button>
                  ) : (
                    <Link
                      href="/scheduler"
                      className="inline-flex items-center rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500"
                    >
                      Jadwalkan →
                    </Link>
                  )}
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={isBusy}
                    onClick={() =>
                      void handleAction(asset.id, () =>
                        onReview(asset.id, 'REJECTED')
                      )
                    }
                  >
                    Reject
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Hapus aset ${asset.id.slice(0, 8)}`}
                    disabled={isBusy}
                    onClick={() =>
                      void handleAction(asset.id, () => onDelete(asset.id))
                    }
                    className="ml-auto text-rose-400 hover:bg-rose-950/40"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
