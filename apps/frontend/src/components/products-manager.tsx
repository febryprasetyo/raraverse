'use client';

import { Check, Copy, Search } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import type { Product, ProductStatus } from '@ebieshop/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { StatePanel } from '@/components/ui/state-panel';

export interface ProductsManagerProps {
  products: Product[];
  loading: boolean;
  errorMsg?: string;
  onRetry: () => void;
  onSyncKalodata: (input: {
    niche: string;
    maxPriceIdr: number;
    minRating: number;
  }) => Promise<void>;
  onUpdateProduct: (
    id: string,
    patch: Partial<
      Pick<
        Product,
        | 'triggerKeyword'
        | 'biolinkNumber'
        | 'affiliateUrls'
        | 'rawMediaDir'
        | 'status'
      >
    >
  ) => Promise<void>;
}

const STATUS_FILTERS: Array<'ALL' | ProductStatus> = [
  'ALL',
  'CANDIDATE',
  'CURATED',
  'ACTIVE',
  'PAUSED',
  'DROPPED',
];

export function ProductsManager({
  products,
  loading,
  errorMsg,
  onRetry,
  onSyncKalodata,
  onUpdateProduct,
}: ProductsManagerProps) {
  const [filter, setFilter] = useState<'ALL' | ProductStatus>('ALL');
  const [search, setSearch] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [niche, setNiche] = useState('perlengkapan_dapur');
  const [syncing, setSyncing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [keywordDraft, setKeywordDraft] = useState('');
  const [biolinkDraft, setBiolinkDraft] = useState('');
  const [shopeeDraft, setShopeeDraft] = useState('');
  const [rawDirDraft, setRawDirDraft] = useState('');

  async function handleSync(e: FormEvent) {
    e.preventDefault();
    setSyncing(true);
    setActionError(null);
    try {
      await onSyncKalodata({ niche, maxPriceIdr: 99999, minRating: 4.8 });
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Gagal sinkronisasi Kalodata'
      );
    } finally {
      setSyncing(false);
    }
  }

  function startEdit(product: Product) {
    setEditingId(product.id);
    setKeywordDraft(product.triggerKeyword);
    setBiolinkDraft(product.biolinkNumber);
    setShopeeDraft(product.affiliateUrls.shopeeShortlink ?? '');
    setRawDirDraft(product.rawMediaDir);
  }

  async function saveEdit(product: Product) {
    await onUpdateProduct(product.id, {
      triggerKeyword: keywordDraft.toUpperCase(),
      biolinkNumber: biolinkDraft,
      rawMediaDir: rawDirDraft,
      affiliateUrls: {
        ...product.affiliateUrls,
        ...(shopeeDraft ? { shopeeShortlink: shopeeDraft } : {}),
      },
    });
    setEditingId(null);
  }

  async function handleCopyShortlink(id: string, url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // Ignore clipboard errors in headless tests
    }
  }

  const visibleProducts = products.filter((p) => {
    const matchesStatus = filter === 'ALL' || p.status === filter;
    const q = search.trim().toLowerCase();
    const matchesQuery =
      !q ||
      p.name.toLowerCase().includes(q) ||
      p.triggerKeyword.toLowerCase().includes(q);
    return matchesStatus && matchesQuery;
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Kalodata Product Discovery"
          subtitle="Tarik kandidat produk winning (harga < Rp100.000, rating >= 4.8)"
        />
        <form onSubmit={handleSync} className="flex flex-wrap items-end gap-3">
          <div className="min-w-56 flex-1">
            <label
              htmlFor="kalodata-niche"
              className="block text-xs font-medium text-[var(--text-secondary)]"
            >
              Niche / Kategori
            </label>
            <input
              id="kalodata-niche"
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-slate-900 focus:outline-none dark:focus:border-emerald-500"
            />
          </div>
          <Button type="submit" disabled={syncing}>
            {syncing ? 'Menyinkronkan...' : 'Sinkronkan Kalodata'}
          </Button>
        </form>
        {actionError ? (
          <div
            role="alert"
            className="mt-4 flex items-start justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200"
          >
            <span>{actionError}</span>
            <button
              type="button"
              onClick={() => setActionError(null)}
              className="font-semibold underline"
            >
              Tutup
            </button>
          </div>
        ) : null}
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter status produk">
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
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-[var(--text-muted)]"
            aria-hidden="true"
          />
          <input
            type="search"
            aria-label="Cari produk atau keyword"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari produk / keyword..."
            className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] py-1.5 pl-8 pr-3 text-xs text-[var(--text-primary)] placeholder-slate-400 focus:border-slate-900 focus:outline-none"
          />
        </div>
      </div>

      {loading ? (
        <StatePanel status="loading" title="Memuat daftar produk..." />
      ) : errorMsg ? (
        <StatePanel
          status="error"
          title="Gagal memuat produk"
          description={errorMsg}
          onRetry={onRetry}
        />
      ) : visibleProducts.length === 0 ? (
        <StatePanel
          status="empty"
          title="Tidak ada produk pada filter ini"
          description="Coba pilih filter lain atau lakukan sinkronisasi Kalodata."
        />
      ) : (
        <div className="space-y-4">
          {visibleProducts.map((product) => {
            const isEditing = editingId === product.id;
            const clipsReady = product.rawMediaClipCount >= 3;

            return (
              <Card key={product.id}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-[var(--text-primary)]">
                        {product.name}
                      </h3>
                      <Badge tone={product.status === 'ACTIVE' ? 'success' : 'info'}>
                        {product.status}
                      </Badge>
                      <Badge tone={clipsReady ? 'success' : 'warning'}>
                        {product.rawMediaClipCount} klip mentah
                      </Badge>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)]">
                      Rp{product.priceIdr.toLocaleString('id-ID')} • Rating{' '}
                      {product.rating.toFixed(1)} • Komisi {product.commissionRatePct}%{' '}
                      {product.isCommissionXtra ? '(XTRA)' : ''}
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                      Keyword:{' '}
                      <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400">
                        {product.triggerKeyword}
                      </span>{' '}
                      • Biolink #{product.biolinkNumber} • Folder:{' '}
                      <span className="font-mono">{product.rawMediaDir}</span>
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {product.affiliateUrls.shopeeShortlink ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          void handleCopyShortlink(
                            product.id,
                            product.affiliateUrls.shopeeShortlink!
                          )
                        }
                      >
                        {copiedId === product.id ? (
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                        Salin Shortlink
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => startEdit(product)}
                    >
                      Edit Kurasi
                    </Button>
                    {product.status === 'CANDIDATE' ? (
                      <Button
                        size="sm"
                        onClick={() =>
                          void onUpdateProduct(product.id, { status: 'CURATED' })
                        }
                      >
                        Set CURATED
                      </Button>
                    ) : null}
                    {product.status === 'CURATED' ? (
                      <Button
                        size="sm"
                        onClick={() =>
                          void onUpdateProduct(product.id, { status: 'ACTIVE' })
                        }
                      >
                        Aktifkan
                      </Button>
                    ) : null}
                  </div>
                </div>

                {isEditing ? (
                  <div className="mt-4 grid gap-3 border-t border-[var(--border-hairline)] pt-4 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor={`kw-${product.id}`}
                        className="block text-xs font-medium text-[var(--text-secondary)]"
                      >
                        Trigger Keyword
                      </label>
                      <input
                        id={`kw-${product.id}`}
                        value={keywordDraft}
                        onChange={(e) => setKeywordDraft(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-1.5 text-sm text-[var(--text-primary)]"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor={`bio-${product.id}`}
                        className="block text-xs font-medium text-[var(--text-secondary)]"
                      >
                        Nomor Biolink
                      </label>
                      <input
                        id={`bio-${product.id}`}
                        value={biolinkDraft}
                        onChange={(e) => setBiolinkDraft(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-1.5 text-sm text-[var(--text-primary)]"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor={`shopee-${product.id}`}
                        className="block text-xs font-medium text-[var(--text-secondary)]"
                      >
                        Shopee Shortlink
                      </label>
                      <input
                        id={`shopee-${product.id}`}
                        value={shopeeDraft}
                        onChange={(e) => setShopeeDraft(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-1.5 text-sm text-[var(--text-primary)]"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor={`raw-${product.id}`}
                        className="block text-xs font-medium text-[var(--text-secondary)]"
                      >
                        Folder raw_media_dir
                      </label>
                      <input
                        id={`raw-${product.id}`}
                        value={rawDirDraft}
                        onChange={(e) => setRawDirDraft(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-1.5 text-sm text-[var(--text-primary)]"
                      />
                    </div>
                    <div className="flex gap-2 sm:col-span-2">
                      <Button size="sm" onClick={() => void saveEdit(product)}>
                        Simpan Perubahan
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingId(null)}
                      >
                        Batal
                      </Button>
                    </div>
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
