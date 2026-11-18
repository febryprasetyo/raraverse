'use client';

import {
  Ban,
  BookmarkCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Database,
  ExternalLink,
  Eye,
  Film,
  Link2,
  MoreVertical,
  Pause,
  Pencil,
  Play,
  RefreshCw,
  Search,
  Sparkles,
  Star,
  Trash2,
  Zap,
} from 'lucide-react';
import Link from 'next/link';
import { Fragment, useEffect, useMemo, useState, type FormEvent } from 'react';
import type {
  KalodataCandidate,
  KalodataVideoDetail,
  Product,
  ProductStatus,
} from '@ebieshop/shared';
import { KalodataProductDetailPanel } from '@/components/kalodata-product-detail-panel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { StatePanel } from '@/components/ui/state-panel';
import {
  formatCompactCount,
  formatCompactIdr,
  formatExactIdr,
} from '@/lib/kalodata-format';

export type ProductsWorkspaceMode = 'discovery' | 'curation';

export interface ProductsManagerProps {
  initialMode?: ProductsWorkspaceMode;
  products: Product[];
  loading: boolean;
  errorMsg?: string;
  onRetry: () => void;
  onSyncKalodata: (input: {
    niche: string;
    maxPriceIdr?: number;
    minRating?: number;
    limit?: number;
    previewOnly?: boolean;
  }) => Promise<{ syncedCount: number; candidates: KalodataCandidate[] } | void>;
  onSaveKalodataCandidates?: (input: {
    niche?: string;
    candidates: KalodataCandidate[];
  }) => Promise<{ savedCount: number; items: Product[] } | void>;
  onDeleteProduct?: (id: string) => Promise<void>;
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
  ) => Promise<Product | void>;
  onSyncLnkBio?: (id: string) => Promise<Product | void>;
  onDeleteLnkBio?: (id: string) => Promise<void>;
}

type TableScopeKey = 'new-search' | 'saved-discovery' | 'curated';

const NO_PRICE_CAP = 1_000_000_000;
const PAGE_SIZE_OPTIONS = [10, 15, 25, 50] as const;

function statusBadgeTone(status: ProductStatus) {
  switch (status) {
    case 'ACTIVE':
      return 'success' as const;
    case 'CURATED':
      return 'info' as const;
    case 'PAUSED':
      return 'warning' as const;
    case 'DROPPED':
      return 'danger' as const;
    default:
      return 'violet' as const;
  }
}

function getProductL1Category(product: Product): string {
  return (
    product.kalodataSnapshot?.priCategory?.categoryName?.trim() ||
    product.niche.trim() ||
    'Lainnya'
  );
}

function matchesProductQuery(product: Product, rawQuery: string): boolean {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return true;
  const snapshot = product.kalodataSnapshot;
  return (
    product.name.toLowerCase().includes(q) ||
    product.triggerKeyword.toLowerCase().includes(q) ||
    product.niche.toLowerCase().includes(q) ||
    product.biolinkNumber.toLowerCase().includes(q) ||
    (snapshot?.sellerName?.toLowerCase().includes(q) ?? false) ||
    (snapshot?.priCategory?.categoryName.toLowerCase().includes(q) ?? false) ||
    (snapshot?.secCategory?.categoryName.toLowerCase().includes(q) ?? false)
  );
}

function candidateToFallbackProduct(
  candidate: KalodataCandidate,
  niche: string
): Product {
  const nowIso = new Date().toISOString();
  return {
    id: `kalodata-${candidate.kalodataProductId}`,
    kalodataProductId: candidate.kalodataProductId,
    niche: candidate.niche || niche,
    name: candidate.name,
    priceIdr: candidate.priceIdr,
    rating: candidate.rating,
    commissionRatePct: candidate.commissionRatePct,
    isCommissionXtra: candidate.isCommissionXtra,
    isOfficialStore: candidate.isOfficialStore,
    biolinkNumber: 'C-NEW',
    triggerKeyword: 'KDNEW',
    affiliateUrls: {
      tiktokProductId: candidate.kalodataProductId,
    },
    kalodataSnapshot: {
      ...(candidate.imageUrl ? { imageUrl: candidate.imageUrl } : {}),
      weeklyRevenueIdr: candidate.weeklyRevenueIdr,
      weeklyUnitsSold: candidate.weeklyUnitsSold,
      referenceVideoUrls: candidate.referenceVideoUrls ?? [],
      referenceVideos: candidate.referenceVideos ?? [],
      ...(candidate.unitPriceExactIdr !== undefined
        ? { unitPriceExactIdr: candidate.unitPriceExactIdr }
        : {}),
      ...(candidate.revenueExactIdr !== undefined
        ? { revenueExactIdr: candidate.revenueExactIdr }
        : {}),
      ...(candidate.revenueGrowthRatePct !== undefined
        ? { revenueGrowthRatePct: candidate.revenueGrowthRatePct }
        : {}),
      ...(candidate.liveRevenueIdr !== undefined
        ? { liveRevenueIdr: candidate.liveRevenueIdr }
        : {}),
      ...(candidate.videoRevenueIdr !== undefined
        ? { videoRevenueIdr: candidate.videoRevenueIdr }
        : {}),
      ...(candidate.showcaseRevenueIdr !== undefined
        ? { showcaseRevenueIdr: candidate.showcaseRevenueIdr }
        : {}),
      ...(candidate.launchDate !== undefined
        ? { launchDate: candidate.launchDate }
        : {}),
      ...(candidate.sellerId !== undefined
        ? { sellerId: candidate.sellerId }
        : {}),
      ...(candidate.sellerName !== undefined
        ? { sellerName: candidate.sellerName }
        : {}),
      ...(candidate.skuCount !== undefined
        ? { skuCount: candidate.skuCount }
        : {}),
      ...(candidate.priCategory !== undefined
        ? { priCategory: candidate.priCategory }
        : {}),
      ...(candidate.secCategory !== undefined
        ? { secCategory: candidate.secCategory }
        : {}),
      ...(candidate.terCategory !== undefined
        ? { terCategory: candidate.terCategory }
        : {}),
      syncedAt: nowIso,
    },
    rawMediaDir: `raw_media_dir/${candidate.kalodataProductId}`,
    rawMediaClipCount: 0,
    status: 'CANDIDATE',
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

const NO_SPINNER_INPUT_CLASS =
  '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';

function TopVideosCell({
  videos,
  legacyUrls,
  fallbackImageUrl,
}: {
  videos: KalodataVideoDetail[];
  legacyUrls: string[];
  fallbackImageUrl?: string;
}) {
  if (videos.length > 0) {
    return (
      <div
        className="flex flex-nowrap items-center gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        {videos.slice(0, 3).map((video, idx) => {
          const href = video.videoUrl ?? legacyUrls[idx];
          const cardContent = (
            <div className="group relative flex h-[108px] w-[80px] shrink-0 flex-col justify-between overflow-hidden rounded-xl border border-violet-300/50 bg-gradient-to-br from-violet-950 via-slate-900 to-teal-950 p-1.5 text-left text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-300 hover:shadow-md">
              {fallbackImageUrl ? (
                <img
                  src={fallbackImageUrl}
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="absolute inset-0 h-full w-full object-cover opacity-55 transition-transform duration-300 group-hover:scale-110"
                />
              ) : null}
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-gradient-to-t from-slate-950/95 via-violet-950/45 to-teal-900/35"
              />
              <div className="relative z-10 flex items-center justify-between gap-1">
                <span className="rounded-md bg-gradient-to-r from-teal-500 to-emerald-500 px-1.5 py-0.5 text-[9px] font-bold text-slate-950">
                  #{idx + 1}
                </span>
                <div className="flex items-center gap-0.5">
                  {video.ad === 1 ? (
                    <span className="rounded bg-sky-500 px-1 py-0.5 text-[8px] font-bold text-slate-950">
                      AD
                    </span>
                  ) : null}
                  {video.aiVideo === 1 ? (
                    <span className="rounded bg-amber-400 px-1 py-0.5 text-[8px] font-bold text-slate-950">
                      AI
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="relative z-10 flex items-center justify-center">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/30 text-white backdrop-blur-xs transition-all duration-200 group-hover:scale-110 group-hover:bg-amber-400 group-hover:text-slate-950">
                  <Play className="h-3.5 w-3.5 fill-current pl-0.5" aria-hidden="true" />
                </span>
              </div>
              <div className="relative z-10 space-y-0.5">
                <div className="truncate text-[10px] font-semibold text-white">
                  {video.belongedCreatorHandle
                    ? `@${video.belongedCreatorHandle}`
                    : `Video #${idx + 1}`}
                </div>
                <div className="text-[10px] font-bold tabular-nums text-amber-300">
                  {formatCompactIdr(video.revenue)}
                </div>
                <div className="text-[9px] tabular-nums text-sky-100">
                  {formatCompactCount(video.views)} views
                </div>
              </div>
            </div>
          );

          return href ? (
            <a
              key={video.videoId}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Buka video TikTok ${video.belongedCreatorHandle ?? video.videoId}`}
              className="shrink-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
            >
              {cardContent}
            </a>
          ) : (
            <div key={video.videoId} className="shrink-0">
              {cardContent}
            </div>
          );
        })}
      </div>
    );
  }

  if (legacyUrls.length > 0) {
    return (
      <div
        className="flex flex-wrap gap-1.5"
        onClick={(e) => e.stopPropagation()}
      >
        {legacyUrls.slice(0, 3).map((url, idx) => (
          <a
            key={url}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-2 py-1 text-[11px] font-medium text-emerald-400 hover:underline"
          >
            Video #{idx + 1}
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        ))}
      </div>
    );
  }

  return (
    <div className="w-40 rounded-xl border border-dashed border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-2.5 py-2 text-center text-[11px] text-[var(--text-secondary)]">
      Tidak ada video terkait yang ditemukan
    </div>
  );
}

function TablePagination({
  tableKey,
  totalItems,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: {
  tableKey: TableScopeKey;
  totalItems: number;
  page: number;
  pageSize: number;
  onPageChange: (nextPage: number) => void;
  onPageSizeChange: (nextSize: number) => void;
}) {
  if (totalItems === 0) {
    return null;
  }
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const startIndex = (safePage - 1) * pageSize + 1;
  const endIndex = Math.min(safePage * pageSize, totalItems);

  const pageNumbers: number[] = [];
  const windowEnd = Math.min(totalPages, Math.max(1, safePage - 2) + 4);
  const windowStart = Math.max(1, windowEnd - 4);
  for (let p = windowStart; p <= windowEnd; p += 1) {
    pageNumbers.push(p);
  }

  return (
    <nav
      aria-label={`Navigasi halaman ${tableKey}`}
      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-700/80 bg-[var(--bg-surface)] px-4 py-2.5 text-xs text-[var(--text-secondary)]"
    >
      <div className="flex flex-wrap items-center gap-3">
        <span>
          Menampilkan{' '}
          <span className="font-semibold tabular-nums text-[var(--text-primary)]">
            {startIndex}–{endIndex}
          </span>{' '}
          dari{' '}
          <span className="font-semibold tabular-nums text-[var(--text-primary)]">
            {totalItems}
          </span>{' '}
          produk
        </span>
        <div className="flex items-center gap-1.5">
          <label
            htmlFor={`page-size-${tableKey}`}
            className="whitespace-nowrap text-[var(--text-secondary)]"
          >
            Baris per halaman:
          </label>
          <select
            id={`page-size-${tableKey}`}
            aria-label={`Baris per halaman ${tableKey}`}
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="rounded-lg border border-slate-700 bg-[var(--bg-canvas)] px-2 py-1 text-xs font-medium text-[var(--text-primary)] focus:border-teal-400 focus:outline-none"
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <Button
          size="sm"
          variant="secondary"
          disabled={safePage <= 1}
          aria-label={`Halaman sebelumnya ${tableKey}`}
          onClick={() => onPageChange(safePage - 1)}
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Sebelumnya
        </Button>
        {pageNumbers.map((num) => (
          <Button
            key={num}
            size="sm"
            variant={num === safePage ? 'primary' : 'secondary'}
            aria-current={num === safePage ? 'page' : undefined}
            aria-label={`Halaman ${num} ${tableKey}`}
            className={
              num === safePage
                ? '!border-teal-400/40 !bg-gradient-to-r !from-teal-600 !to-sky-600 !text-white'
                : ''
            }
            onClick={() => onPageChange(num)}
          >
            {num}
          </Button>
        ))}
        <Button
          size="sm"
          variant="secondary"
          disabled={safePage >= totalPages}
          aria-label={`Halaman berikutnya ${tableKey}`}
          onClick={() => onPageChange(safePage + 1)}
        >
          Berikutnya
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}

export function ProductsManager({
  initialMode = 'discovery',
  products,
  loading,
  errorMsg,
  onRetry,
  onSyncKalodata,
  onDeleteProduct,
  onUpdateProduct,
  onSyncLnkBio,
  onDeleteLnkBio,
}: ProductsManagerProps) {
  const [activeMode, setActiveMode] = useState<ProductsWorkspaceMode>(initialMode);
  const [discoveryCategoryFilter, setDiscoveryCategoryFilter] = useState<string>('ALL');
  const [curationCategoryFilter, setCurationCategoryFilter] = useState<string>('ALL');
  const [discoverySearch, setDiscoverySearch] = useState('');
  const [curationSearch, setCurationSearch] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [openMenuKey, setOpenMenuKey] = useState<string | null>(null);
  const [niche, setNiche] = useState('skincare');
  const [maxPriceInput, setMaxPriceInput] = useState('');
  const [minRatingInput, setMinRatingInput] = useState('4.8');
  const [limitInput, setLimitInput] = useState('15');
  const [syncing, setSyncing] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [editBusyId, setEditBusyId] = useState<string | null>(null);
  const [lnkBioBusyId, setLnkBioBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const [latestSearchNiche, setLatestSearchNiche] = useState<string>('');
  const [latestSearchCandidates, setLatestSearchCandidates] = useState<
    KalodataCandidate[]
  >([]);
  const [latestSearchSyncedCount, setLatestSearchSyncedCount] = useState<number>(0);

  const [newSearchPage, setNewSearchPage] = useState(1);
  const [newSearchPageSize, setNewSearchPageSize] = useState(10);
  const [savedPage, setSavedPage] = useState(1);
  const [savedPageSize, setSavedPageSize] = useState(10);
  const [curatedPage, setCuratedPage] = useState(1);
  const [curatedPageSize, setCuratedPageSize] = useState(10);

  const [expandedDetailKey, setExpandedDetailKey] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [keywordDraft, setKeywordDraft] = useState('');
  const [biolinkDraft, setBiolinkDraft] = useState('');
  const [shopeeDraft, setShopeeDraft] = useState('');
  const [rawDirDraft, setRawDirDraft] = useState('');

  useEffect(() => {
    setActiveMode(initialMode);
  }, [initialMode]);

  const candidateProductsAll = useMemo(
    () => products.filter((p) => p.status === 'CANDIDATE'),
    [products]
  );

  const curatedProductsAll = useMemo(
    () => products.filter((p) => p.status !== 'CANDIDATE'),
    [products]
  );

  const productByKalodataId = useMemo(() => {
    const map = new Map<string, Product>();
    for (const p of products) {
      if (p.kalodataProductId) {
        map.set(p.kalodataProductId, p);
      }
    }
    return map;
  }, [products]);

  const latestSearchProducts = useMemo(() => {
    return latestSearchCandidates.map(
      (candidate) =>
        productByKalodataId.get(candidate.kalodataProductId) ??
        candidateToFallbackProduct(candidate, latestSearchNiche || 'skincare')
    );
  }, [latestSearchCandidates, latestSearchNiche, productByKalodataId]);

  const latestSearchKalodataIds = useMemo(
    () => new Set(latestSearchCandidates.map((c) => c.kalodataProductId)),
    [latestSearchCandidates]
  );

  const savedDiscoveryPool = useMemo(
    () =>
      candidateProductsAll.filter(
        (p) =>
          !p.kalodataProductId || !latestSearchKalodataIds.has(p.kalodataProductId)
      ),
    [candidateProductsAll, latestSearchKalodataIds]
  );

  const discoveryCategoryGroups = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of savedDiscoveryPool) {
      const key = getProductL1Category(p);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([key, count]) => ({ key, count }));
  }, [savedDiscoveryPool]);

  const activeDiscoveryCategory =
    discoveryCategoryFilter === 'ALL' ||
    discoveryCategoryGroups.some((g) => g.key === discoveryCategoryFilter)
      ? discoveryCategoryFilter
      : 'ALL';

  const savedDiscoveryInCategory = useMemo(
    () =>
      savedDiscoveryPool.filter(
        (p) =>
          activeDiscoveryCategory === 'ALL' ||
          getProductL1Category(p) === activeDiscoveryCategory
      ),
    [savedDiscoveryPool, activeDiscoveryCategory]
  );

  const nichesInActiveDiscoveryCategory = useMemo(
    () =>
      Array.from(
        new Set(savedDiscoveryInCategory.map((p) => p.niche.trim()).filter(Boolean))
      ),
    [savedDiscoveryInCategory]
  );

  const visibleSavedDiscoveryProducts = useMemo(
    () =>
      savedDiscoveryInCategory.filter((p) =>
        matchesProductQuery(p, discoverySearch)
      ),
    [savedDiscoveryInCategory, discoverySearch]
  );

  const curationCategoryGroups = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of curatedProductsAll) {
      const key = getProductL1Category(p);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([key, count]) => ({ key, count }));
  }, [curatedProductsAll]);

  const activeCurationCategory =
    curationCategoryFilter === 'ALL' ||
    curationCategoryGroups.some((g) => g.key === curationCategoryFilter)
      ? curationCategoryFilter
      : 'ALL';

  const visibleCuratedProducts = useMemo(
    () =>
      curatedProductsAll.filter(
        (p) =>
          (activeCurationCategory === 'ALL' ||
            getProductL1Category(p) === activeCurationCategory) &&
          matchesProductQuery(p, curationSearch)
      ),
    [curatedProductsAll, activeCurationCategory, curationSearch]
  );

  async function handleSearchAndSave(e: FormEvent) {
    e.preventDefault();
    setSyncing(true);
    setActionError(null);
    setActionNotice(null);
    try {
      const parsedMaxPrice = Number(maxPriceInput.trim());
      const maxPriceIdr =
        maxPriceInput.trim() && Number.isFinite(parsedMaxPrice) && parsedMaxPrice > 0
          ? Math.min(Math.round(parsedMaxPrice), NO_PRICE_CAP)
          : NO_PRICE_CAP;
      const parsedRating = Number(minRatingInput);
      const minRating =
        Number.isFinite(parsedRating) && parsedRating >= 0 && parsedRating <= 5
          ? parsedRating
          : 4.8;
      const parsedLimit = Number(limitInput);
      const limit =
        Number.isFinite(parsedLimit) && parsedLimit >= 1
          ? Math.min(Math.round(parsedLimit), 50)
          : 15;
      const targetNiche = niche.trim() || 'skincare';

      const result = await onSyncKalodata({
        niche: targetNiche,
        maxPriceIdr,
        minRating,
        limit,
        previewOnly: false,
      });

      if (result && Array.isArray(result.candidates)) {
        setLatestSearchNiche(targetNiche);
        setLatestSearchCandidates(result.candidates);
        setLatestSearchSyncedCount(result.syncedCount);
        setNewSearchPage(1);
        if (result.candidates.length === 0) {
          setActionNotice(
            `Pencarian Kalodata untuk "${targetNiche}" tidak menemukan produk yang cocok.`
          );
        } else {
          setActionNotice(
            `Berhasil mengambil ${result.candidates.length} produk "${targetNiche}" dari Kalodata (${result.syncedCount} produk baru disimpan ke database).`
          );
        }
      }
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Gagal mengambil data Kalodata'
      );
    } finally {
      setSyncing(false);
    }
  }

  async function handleRefreshNicheGroup(targetNiche: string, groupCount: number) {
    setBulkBusy(true);
    setActionError(null);
    setActionNotice(null);
    try {
      const res = await onSyncKalodata({
        niche: targetNiche,
        maxPriceIdr: NO_PRICE_CAP,
        minRating: 4.8,
        limit: Math.min(Math.max(groupCount, 15), 50),
        previewOnly: false,
      });
      if (res && Array.isArray(res.candidates)) {
        setLatestSearchNiche(targetNiche);
        setLatestSearchCandidates(res.candidates);
        setLatestSearchSyncedCount(res.syncedCount);
        setNewSearchPage(1);
      }
      setActionNotice(
        `Metrik Kalodata untuk kategori "${targetNiche}" telah diperbarui.`
      );
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Gagal memperbarui kategori keyword'
      );
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleDeleteMany(targetProducts: Product[], label: string) {
    if (!onDeleteProduct || targetProducts.length === 0) {
      return;
    }
    setBulkBusy(true);
    setActionError(null);
    setActionNotice(null);
    try {
      for (const item of targetProducts) {
        await onDeleteProduct(item.id);
      }
      setActionNotice(`${targetProducts.length} produk (${label}) berhasil dihapus.`);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Gagal menghapus produk'
      );
    } finally {
      setBulkBusy(false);
    }
  }

  function toggleDetail(rowKey: string) {
    setExpandedDetailKey((prev) => (prev === rowKey ? null : rowKey));
  }

  function startEdit(rowKey: string, product: Product) {
    setEditingKey((prev) => {
      if (prev === rowKey) {
        return null;
      }
      const isCandidatePlaceholder = /^C-/i.test(product.biolinkNumber);
      setKeywordDraft(product.triggerKeyword);
      setBiolinkDraft(isCandidatePlaceholder ? '' : product.biolinkNumber);
      setShopeeDraft(product.affiliateUrls.shopeeShortlink ?? '');
      setRawDirDraft(product.rawMediaDir);
      return rowKey;
    });
  }

  async function saveEdit(product: Product) {
    setEditBusyId(product.id);
    setActionError(null);
    setActionNotice(null);
    try {
      const trimmedBiolink = biolinkDraft.trim();
      const updated = await onUpdateProduct(product.id, {
        triggerKeyword: keywordDraft.trim().toUpperCase() || product.triggerKeyword,
        ...(trimmedBiolink ? { biolinkNumber: trimmedBiolink } : {}),
        rawMediaDir: rawDirDraft,
        affiliateUrls: {
          ...product.affiliateUrls,
          ...(shopeeDraft.trim() ? { shopeeShortlink: shopeeDraft.trim() } : {}),
        },
      });
      setEditingKey(null);
      if (updated) {
        const lnkInfo = updated.affiliateUrls.lnkBioId
          ? ` (Lnk.Bio ID: ${updated.affiliateUrls.lnkBioId})`
          : '';
        setActionNotice(
          `Produk "${updated.name}" disimpan sebagai ${updated.status} • Keyword ${updated.triggerKeyword} • Biolink #${updated.biolinkNumber}${lnkInfo}.`
        );
      }
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Gagal menyimpan perubahan kurasi produk'
      );
    } finally {
      setEditBusyId(null);
    }
  }

  async function handleCurateCandidate(product: Product) {
    const trimmedShopee = shopeeDraft.trim();
    if (!trimmedShopee) {
      setActionError(
        'Isi Shopee Shortlink terlebih dahulu agar produk otomatis mendapatkan nomor Biolink dan terposting ke Lnk.Bio.'
      );
      return;
    }
    setEditBusyId(product.id);
    setActionError(null);
    setActionNotice(null);
    try {
      const updated = await onUpdateProduct(product.id, {
        status: 'CURATED',
        affiliateUrls: {
          ...product.affiliateUrls,
          shopeeShortlink: trimmedShopee,
        },
      });
      setEditingKey(null);
      if (updated) {
        const lnkInfo = updated.affiliateUrls.lnkBioId
          ? ` & Lnk.Bio ID ${updated.affiliateUrls.lnkBioId}`
          : '';
        setActionNotice(
          `Produk "${updated.name}" masuk Produk Kurasi • Keyword Gemini SEO+GEO: ${updated.triggerKeyword} • Biolink #${updated.biolinkNumber}${lnkInfo}.`
        );
      } else {
        setActionNotice(
          `Produk "${product.name}" masuk Produk Kurasi dengan Keyword SEO+GEO & Biolink Lnk.Bio otomatis.`
        );
      }
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Gagal memasukkan produk ke Produk Kurasi'
      );
    } finally {
      setEditBusyId(null);
    }
  }

  async function handleStatusUpdate(product: Product, status: ProductStatus) {
    setActionError(null);
    try {
      const updated = await onUpdateProduct(product.id, { status });
      if (updated && (status === 'CURATED' || status === 'ACTIVE')) {
        const lnkInfo = updated.affiliateUrls.lnkBioId
          ? ` (Lnk.Bio ID: ${updated.affiliateUrls.lnkBioId})`
          : '';
        setActionNotice(
          `Produk "${updated.name}" menjadi ${updated.status} • Keyword: ${updated.triggerKeyword} • Biolink #${updated.biolinkNumber}${lnkInfo}.`
        );
      }
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : `Gagal mengubah status ke ${status}`
      );
    }
  }

  async function handleSyncLnkBio(product: Product) {
    if (!onSyncLnkBio) {
      return;
    }
    setLnkBioBusyId(product.id);
    setActionError(null);
    setActionNotice(null);
    try {
      const updated = await onSyncLnkBio(product.id);
      if (updated) {
        const lnkInfo = updated.affiliateUrls.lnkBioId
          ? ` (Lnk.Bio ID: ${updated.affiliateUrls.lnkBioId})`
          : '';
        setActionNotice(
          `Produk "${updated.name}" diposting ke Lnk.Bio sebagai Biolink #${updated.biolinkNumber}${lnkInfo}.`
        );
      } else {
        setActionNotice(`Produk "${product.name}" berhasil disinkronkan ke Lnk.Bio.`);
      }
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Gagal memposting produk ke Lnk.Bio'
      );
    } finally {
      setLnkBioBusyId(null);
    }
  }

  async function handleDeleteLnkBio(product: Product) {
    if (!onDeleteLnkBio) {
      return;
    }
    setLnkBioBusyId(product.id);
    setActionError(null);
    setActionNotice(null);
    try {
      await onDeleteLnkBio(product.id);
      setActionNotice(
        `Tautan Lnk.Bio untuk "${product.name}" berhasil dihapus atas konfirmasi operator.`
      );
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Gagal menghapus tautan dari Lnk.Bio'
      );
    } finally {
      setLnkBioBusyId(null);
    }
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

  function renderProductTable({
    tableKey,
    items,
    page,
    pageSize,
    captionText,
    onPageChange,
    onPageSizeChange,
  }: {
    tableKey: TableScopeKey;
    items: Product[];
    page: number;
    pageSize: number;
    captionText: string;
    onPageChange: (nextPage: number) => void;
    onPageSizeChange: (nextSize: number) => void;
  }) {
    const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
    const safePage = Math.min(Math.max(1, page), totalPages);
    const startOffset = (safePage - 1) * pageSize;
    const pagedItems = items.slice(startOffset, startOffset + pageSize);

    return (
      <div className="space-y-3">
        <div className="overflow-x-auto rounded-2xl border border-slate-700/80 bg-[var(--bg-surface)] shadow-[0_12px_32px_rgba(0,0,0,0.35)]">
          <table className="min-w-full border-collapse text-left text-xs">
            <caption className="sr-only">{captionText}</caption>
            <thead className="border-b border-slate-700 bg-gradient-to-r from-teal-950/75 via-sky-950/65 to-violet-950/75 text-[11px] font-bold text-slate-100">
              <tr>
                <th scope="col" className="px-3 py-3 text-center whitespace-nowrap">
                  #
                </th>
                <th scope="col" className="min-w-[290px] px-3 py-3 whitespace-nowrap">
                  Info Produk
                </th>
                <th scope="col" className="px-3 py-3 whitespace-nowrap">
                  Pendapatan
                </th>
                <th scope="col" className="px-3 py-3 whitespace-nowrap">
                  Penjualan
                </th>
                <th scope="col" className="min-w-[272px] px-3 py-3 whitespace-nowrap">
                  Video GMV Tertinggi
                </th>
                <th scope="col" className="px-3 py-3 whitespace-nowrap">
                  Penilaian Produk
                </th>
                <th scope="col" className="px-3 py-3 whitespace-nowrap">
                  Harga Jual Rata-rata
                </th>
                <th scope="col" className="px-3 py-3 whitespace-nowrap">
                  Tingkat Komisi
                </th>
                <th scope="col" className="px-3 py-3 text-center whitespace-nowrap">
                  Aksi
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-hairline)]">
              {pagedItems.map((product, index) => {
                const rowKey = `${tableKey}:${product.id}`;
                const snapshot = product.kalodataSnapshot;
                const isDetailOpen = expandedDetailKey === rowKey;
                const isEditing = editingKey === rowKey;
                const isRowActive = isDetailOpen || isEditing;
                const revenueValue =
                  snapshot?.revenueExactIdr ?? snapshot?.weeklyRevenueIdr;
                const unitPriceValue = snapshot?.unitPriceExactIdr ?? product.priceIdr;
                const hasChannelBreakdown =
                  snapshot?.liveRevenueIdr !== undefined ||
                  snapshot?.videoRevenueIdr !== undefined ||
                  snapshot?.showcaseRevenueIdr !== undefined;
                const categoryChain = [
                  snapshot?.priCategory?.categoryName,
                  snapshot?.secCategory?.categoryName,
                  snapshot?.terCategory?.categoryName,
                ]
                  .filter(Boolean)
                  .join(' › ');
                const detailPanelId = `detail-panel-${tableKey}-${product.id}`;
                const editPanelId = `edit-panel-${tableKey}-${product.id}`;
                const actionMenuId = `action-menu-${tableKey}-${product.id}`;
                const isMenuOpen = openMenuKey === rowKey;
                const isFallbackSynthetic = product.id.startsWith('kalodata-');

                return (
                  <Fragment key={rowKey}>
                    <tr
                      onClick={() => toggleDetail(rowKey)}
                      className={`cursor-pointer align-top transition-colors duration-150 ${
                        isRowActive
                          ? 'bg-gradient-to-r from-emerald-950/50 via-teal-950/35 to-sky-950/40 shadow-[inset_4px_0_0_0_#2dd4bf]'
                          : 'hover:bg-gradient-to-r hover:from-emerald-950/35 hover:via-teal-950/25 hover:to-sky-950/30'
                      }`}
                    >
                      <td className="px-3 py-4 text-center font-semibold tabular-nums text-[var(--text-secondary)]">
                        {startOffset + index + 1}
                      </td>
                      <td className="px-3 py-4">
                        <div className="flex items-start gap-3">
                          {snapshot?.imageUrl ? (
                            <img
                              src={snapshot.imageUrl}
                              alt={product.name}
                              loading="lazy"
                              referrerPolicy="no-referrer"
                              className="h-14 w-14 shrink-0 rounded-xl border border-[var(--border-hairline)] object-cover"
                            />
                          ) : (
                            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] text-[10px] font-semibold text-[var(--text-secondary)]">
                              No Img
                            </div>
                          )}
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              {snapshot?.sellerName ? (
                                <span className="rounded-full bg-[var(--bg-subtle)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-secondary)]">
                                  {snapshot.sellerName}
                                </span>
                              ) : null}
                              {product.isOfficialStore ? (
                                <Badge tone="info" dot>
                                  Official
                                </Badge>
                              ) : null}
                              <Badge tone={statusBadgeTone(product.status)} dot>
                                {product.status}
                              </Badge>
                            </div>
                            <div className="line-clamp-2 text-xs font-semibold text-[var(--text-primary)]">
                              {product.name}
                            </div>
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <span className="font-bold tabular-nums text-[var(--text-primary)]">
                                {formatCompactIdr(product.priceIdr)}
                              </span>
                            </div>
                            <div className="text-[10px] text-[var(--text-secondary)]">
                              {categoryChain || `Keyword: ${product.niche}`}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap">
                        <div className="text-sm font-bold tabular-nums text-[var(--text-primary)]">
                          {formatCompactIdr(revenueValue)}
                        </div>
                        <div className="mt-0.5 font-mono text-[10px] tabular-nums text-[var(--text-secondary)]">
                          {formatExactIdr(revenueValue)}
                        </div>
                        {hasChannelBreakdown ? (
                          <div className="mt-1.5 space-y-0.5 border-t border-[var(--border-hairline)] pt-1 text-[10px] tabular-nums text-[var(--text-secondary)]">
                            <div>
                              Pendapatan Livestream:{' '}
                              <span className="font-semibold text-[var(--text-primary)]">
                                {formatCompactIdr(snapshot?.liveRevenueIdr)}
                              </span>
                            </div>
                            <div>
                              Pendapatan Video:{' '}
                              <span className="font-semibold text-[var(--text-primary)]">
                                {formatCompactIdr(snapshot?.videoRevenueIdr)}
                              </span>
                            </div>
                            <div>
                              Pendapatan Kartu Produk:{' '}
                              <span className="font-semibold text-[var(--text-primary)]">
                                {formatCompactIdr(snapshot?.showcaseRevenueIdr)}
                              </span>
                            </div>
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap">
                        <div className="text-sm font-bold tabular-nums text-[var(--text-primary)]">
                          {formatCompactCount(snapshot?.weeklyUnitsSold)}
                        </div>
                        <div className="mt-0.5 text-[10px] tabular-nums text-[var(--text-secondary)]">
                          {snapshot?.weeklyUnitsSold !== undefined
                            ? `${snapshot.weeklyUnitsSold.toLocaleString('id-ID')} terjual`
                            : '-'}
                        </div>
                      </td>
                      <td className="px-3 py-4">
                        <TopVideosCell
                          videos={snapshot?.referenceVideos ?? []}
                          legacyUrls={snapshot?.referenceVideoUrls ?? []}
                          fallbackImageUrl={snapshot?.imageUrl}
                        />
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap">
                        <div className="inline-flex items-center gap-1 font-semibold tabular-nums text-[var(--text-primary)]">
                          <Star
                            className="h-3.5 w-3.5 fill-amber-400 text-amber-500"
                            aria-hidden="true"
                          />
                          <span>{product.rating.toFixed(1)}</span>
                        </div>
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap">
                        <div className="font-semibold tabular-nums text-[var(--text-primary)]">
                          {formatCompactIdr(unitPriceValue)}
                        </div>
                        <div className="mt-0.5 font-mono text-[10px] tabular-nums text-[var(--text-secondary)]">
                          {formatExactIdr(unitPriceValue)}
                        </div>
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 font-semibold tabular-nums text-[var(--text-primary)]">
                          <span>{product.commissionRatePct}%</span>
                          {product.isCommissionXtra ? (
                            <Badge tone="success">XTRA</Badge>
                          ) : null}
                        </div>
                      </td>
                      <td
                        className="px-3 py-4 text-center whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="relative inline-flex justify-center">
                          <Button
                            size="sm"
                            variant={isMenuOpen ? 'primary' : 'secondary'}
                            aria-expanded={isMenuOpen}
                            aria-controls={actionMenuId}
                            aria-label={`Menu aksi ${product.name}`}
                            title="Menu Aksi"
                            className={`h-8 w-8 rounded-full !px-0 !py-0 ${
                              isMenuOpen
                                ? '!border-teal-400/50 !bg-teal-600 !text-white'
                                : 'border-slate-700 hover:!border-teal-400/60 hover:!bg-teal-950/60'
                            }`}
                            onClick={() =>
                              setOpenMenuKey((prev) => (prev === rowKey ? null : rowKey))
                            }
                          >
                            <MoreVertical className="h-4 w-4" aria-hidden="true" />
                          </Button>
                          {isMenuOpen ? (
                            <div
                              id={actionMenuId}
                              role="toolbar"
                              aria-label={`Aksi untuk ${product.name}`}
                              className="absolute right-full top-1/2 z-30 mr-2 flex -translate-y-1/2 flex-nowrap items-center gap-1 rounded-2xl border border-teal-500/40 bg-slate-900/95 p-1.5 shadow-2xl backdrop-blur-md"
                            >
                              <Button
                                size="sm"
                                variant={isDetailOpen ? 'primary' : 'secondary'}
                                aria-expanded={isDetailOpen}
                                aria-controls={detailPanelId}
                                aria-label="Detail Product"
                                title="Detail Product"
                                className="h-8 w-8 rounded-xl !border-sky-500/40 !bg-sky-950/70 !text-sky-300 hover:!bg-sky-900/80 !px-0 !py-0"
                                onClick={() => {
                                  toggleDetail(rowKey);
                                  setOpenMenuKey(null);
                                }}
                              >
                                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                              </Button>
                              {!isFallbackSynthetic ? (
                                <Button
                                  size="sm"
                                  variant={isEditing ? 'primary' : 'secondary'}
                                  aria-expanded={isEditing}
                                  aria-controls={editPanelId}
                                  aria-label="Edit Kurasi"
                                  title="Edit Kurasi"
                                  className="h-8 w-8 rounded-xl !border-violet-500/40 !bg-violet-950/70 !text-violet-300 hover:!bg-violet-900/80 !px-0 !py-0"
                                  onClick={() => {
                                    startEdit(rowKey, product);
                                    setOpenMenuKey(null);
                                  }}
                                >
                                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                                </Button>
                              ) : null}
                              {product.affiliateUrls.shopeeShortlink ? (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  aria-label="Salin Shortlink"
                                  title="Salin Shortlink"
                                  className="h-8 w-8 rounded-xl !border-teal-500/40 !bg-teal-950/70 !text-teal-300 hover:!bg-teal-900/80 !px-0 !py-0"
                                  onClick={() => {
                                    void handleCopyShortlink(
                                      product.id,
                                      product.affiliateUrls.shopeeShortlink!
                                    );
                                    setOpenMenuKey(null);
                                  }}
                                >
                                  {copiedId === product.id ? (
                                    <Check
                                      className="h-3.5 w-3.5 text-emerald-400"
                                      aria-hidden="true"
                                    />
                                  ) : (
                                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                                  )}
                                </Button>
                              ) : null}
                              {onSyncLnkBio && !isFallbackSynthetic ? (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  disabled={lnkBioBusyId === product.id}
                                  aria-label="Post ke Lnk.Bio"
                                  title="Post ke Lnk.Bio"
                                  className="h-8 w-8 rounded-xl !border-cyan-500/40 !bg-cyan-950/70 !text-cyan-300 hover:!bg-cyan-900/80 !px-0 !py-0"
                                  onClick={() => {
                                    void handleSyncLnkBio(product);
                                    setOpenMenuKey(null);
                                  }}
                                >
                                  <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
                                </Button>
                              ) : null}
                              {!isFallbackSynthetic &&
                              (product.status === 'CANDIDATE' ||
                                product.status === 'PAUSED') ? (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  aria-label="Set CURATED"
                                  title="Set CURATED"
                                  className="h-8 w-8 rounded-xl !border-indigo-500/40 !bg-indigo-950/70 !text-indigo-300 hover:!bg-indigo-900/80 !px-0 !py-0"
                                  onClick={() => {
                                    void handleStatusUpdate(product, 'CURATED');
                                    setOpenMenuKey(null);
                                  }}
                                >
                                  <BookmarkCheck
                                    className="h-3.5 w-3.5"
                                    aria-hidden="true"
                                  />
                                </Button>
                              ) : null}
                              {!isFallbackSynthetic &&
                              (product.status === 'CURATED' ||
                                product.status === 'PAUSED') ? (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  aria-label="Aktifkan"
                                  title="Aktifkan"
                                  className="h-8 w-8 rounded-xl !border-emerald-500/40 !bg-emerald-950/70 !text-emerald-300 hover:!bg-emerald-900/80 !px-0 !py-0"
                                  onClick={() => {
                                    void handleStatusUpdate(product, 'ACTIVE');
                                    setOpenMenuKey(null);
                                  }}
                                >
                                  <Zap className="h-3.5 w-3.5" aria-hidden="true" />
                                </Button>
                              ) : null}
                              {!isFallbackSynthetic &&
                              (product.status === 'CURATED' ||
                                product.status === 'ACTIVE') ? (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  aria-label="Jeda"
                                  title="Jeda"
                                  className="h-8 w-8 rounded-xl !border-amber-500/40 !bg-amber-950/70 !text-amber-300 hover:!bg-amber-900/80 !px-0 !py-0"
                                  onClick={() => {
                                    void handleStatusUpdate(product, 'PAUSED');
                                    setOpenMenuKey(null);
                                  }}
                                >
                                  <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                                </Button>
                              ) : null}
                              {!isFallbackSynthetic && product.status !== 'DROPPED' ? (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  aria-label="Drop"
                                  title="Drop"
                                  className="h-8 w-8 rounded-xl !border-orange-500/40 !bg-orange-950/70 !text-orange-300 hover:!bg-orange-900/80 !px-0 !py-0"
                                  onClick={() => {
                                    void handleStatusUpdate(product, 'DROPPED');
                                    setOpenMenuKey(null);
                                  }}
                                >
                                  <Ban className="h-3.5 w-3.5" aria-hidden="true" />
                                </Button>
                              ) : null}
                              {onDeleteProduct && !isFallbackSynthetic ? (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  aria-label={`Hapus ${product.name}`}
                                  title="Hapus Produk"
                                  className="h-8 w-8 rounded-xl !border-rose-500/40 !bg-rose-950/70 !text-rose-300 hover:!bg-rose-900/80 !px-0 !py-0"
                                  onClick={() => {
                                    void onDeleteProduct(product.id);
                                    setOpenMenuKey(null);
                                  }}
                                >
                                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                </Button>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                    {isDetailOpen ? (
                      <tr id={detailPanelId}>
                        <td colSpan={9} className="bg-[var(--bg-subtle)]/40 px-4 py-4">
                          <KalodataProductDetailPanel product={product} />
                        </td>
                      </tr>
                    ) : null}
                    {isEditing ? (
                      <tr id={editPanelId}>
                        <td colSpan={9} className="bg-[var(--bg-canvas)] px-4 py-4">
                          {product.status === 'CANDIDATE' ? (
                            <div className="space-y-4 rounded-xl border border-teal-500/40 bg-[var(--bg-surface)] p-4">
                              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
                                <span className="text-xs font-semibold text-slate-200">
                                  Kurasi Cepat (Cukup Isi Link Shopee)
                                </span>
                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge tone="info" dot>
                                    Trigger Keyword: Otomatis (SEO + GEO Gemini)
                                  </Badge>
                                  <Badge tone="violet" dot>
                                    Nomor Biolink: Otomatis (#001, #002...) saat masuk Kurasi
                                  </Badge>
                                  <Badge tone="success" dot>
                                    Lnk.Bio: Otomatis Terposting saat disimpan
                                  </Badge>
                                </div>
                              </div>

                              <div>
                                <label
                                  htmlFor={`shopee-${tableKey}-${product.id}`}
                                  className="block text-xs font-medium text-[var(--text-secondary)]"
                                >
                                  Shopee Shortlink (Wajib untuk Kurasi &amp; Lnk.Bio)
                                </label>
                                <input
                                  id={`shopee-${tableKey}-${product.id}`}
                                  type="url"
                                  value={shopeeDraft}
                                  onChange={(e) => setShopeeDraft(e.target.value)}
                                  placeholder="https://shope.ee/..."
                                  className="mt-1 w-full max-w-xl rounded-xl border border-slate-700 bg-[var(--bg-canvas)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-xs placeholder:text-slate-400 focus:border-teal-400 focus:outline-none"
                                />
                              </div>

                              <div className="flex flex-wrap items-center gap-2">
                                <Button
                                  size="sm"
                                  variant="primary"
                                  disabled={editBusyId === product.id}
                                  className="!bg-gradient-to-r !from-teal-600 !to-emerald-600 !text-white hover:!from-teal-500 hover:!to-emerald-500"
                                  onClick={() => void handleCurateCandidate(product)}
                                >
                                  {editBusyId === product.id
                                    ? 'Memproses Kurasi & Lnk.Bio...'
                                    : 'Masukkan ke Produk Kurasi (Auto Keyword & Lnk.Bio)'}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setEditingKey(null)}
                                >
                                  Batal
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="grid gap-3 rounded-xl border border-slate-700 bg-[var(--bg-surface)] p-4 sm:grid-cols-2 lg:grid-cols-4">
                              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5 sm:col-span-2 lg:col-span-4">
                                <span className="text-xs font-semibold text-slate-200">
                                  Kurasi Produk &amp; Sinkronisasi Lnk.Bio
                                </span>
                                {product.affiliateUrls.lnkBioId ? (
                                  <Badge tone="success" dot>
                                    Lnk.Bio Tersinkron • Biolink #{product.biolinkNumber} (ID:{' '}
                                    {product.affiliateUrls.lnkBioId})
                                  </Badge>
                                ) : (
                                  <Badge tone="info" dot>
                                    Biolink #{product.biolinkNumber} • Belum Terposting ke Lnk.Bio
                                  </Badge>
                                )}
                              </div>
                              <div>
                                <label
                                  htmlFor={`kw-${tableKey}-${product.id}`}
                                  className="block text-xs font-medium text-[var(--text-secondary)]"
                                >
                                  Trigger Keyword
                                </label>
                                <input
                                  id={`kw-${tableKey}-${product.id}`}
                                  value={keywordDraft}
                                  onChange={(e) => setKeywordDraft(e.target.value)}
                                  className="mt-1 w-full rounded-xl border border-slate-700 bg-[var(--bg-canvas)] px-3 py-1.5 text-sm text-[var(--text-primary)] focus:border-teal-400 focus:outline-none"
                                />
                              </div>
                              <div>
                                <label
                                  htmlFor={`bio-${tableKey}-${product.id}`}
                                  className="block text-xs font-medium text-[var(--text-secondary)]"
                                >
                                  Nomor Biolink
                                </label>
                                <input
                                  id={`bio-${tableKey}-${product.id}`}
                                  value={biolinkDraft}
                                  onChange={(e) => setBiolinkDraft(e.target.value)}
                                  placeholder="Otomatis (#001, #002...)"
                                  className="mt-1 w-full rounded-xl border border-slate-700 bg-[var(--bg-canvas)] px-3 py-1.5 text-sm text-[var(--text-primary)] placeholder:text-xs placeholder:text-slate-400 focus:border-teal-400 focus:outline-none"
                                />
                              </div>
                              <div>
                                <label
                                  htmlFor={`shopee-${tableKey}-${product.id}`}
                                  className="block text-xs font-medium text-[var(--text-secondary)]"
                                >
                                  Shopee Shortlink
                                </label>
                                <input
                                  id={`shopee-${tableKey}-${product.id}`}
                                  value={shopeeDraft}
                                  onChange={(e) => setShopeeDraft(e.target.value)}
                                  className="mt-1 w-full rounded-xl border border-slate-700 bg-[var(--bg-canvas)] px-3 py-1.5 text-sm text-[var(--text-primary)] focus:border-teal-400 focus:outline-none"
                                />
                              </div>
                              <div>
                                <label
                                  htmlFor={`raw-${tableKey}-${product.id}`}
                                  className="block text-xs font-medium text-[var(--text-secondary)]"
                                >
                                  Folder raw_media_dir
                                </label>
                                <input
                                  id={`raw-${tableKey}-${product.id}`}
                                  value={rawDirDraft}
                                  onChange={(e) => setRawDirDraft(e.target.value)}
                                  className="mt-1 w-full rounded-xl border border-slate-700 bg-[var(--bg-canvas)] px-3 py-1.5 text-sm text-[var(--text-primary)] focus:border-teal-400 focus:outline-none"
                                />
                              </div>
                              <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-4">
                                <Button
                                  size="sm"
                                  variant="primary"
                                  disabled={editBusyId === product.id}
                                  onClick={() => void saveEdit(product)}
                                >
                                  Simpan Perubahan
                                </Button>
                                {onSyncLnkBio ? (
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    disabled={
                                      lnkBioBusyId === product.id || editBusyId === product.id
                                    }
                                    onClick={() => void handleSyncLnkBio(product)}
                                  >
                                    <Link2
                                      className="h-3.5 w-3.5 text-cyan-300"
                                      aria-hidden="true"
                                    />
                                    {lnkBioBusyId === product.id
                                      ? 'Memposting ke Lnk.Bio...'
                                      : 'Post ke Lnk.Bio'}
                                  </Button>
                                ) : null}
                                {onDeleteLnkBio && product.affiliateUrls.lnkBioId ? (
                                  <Button
                                    size="sm"
                                    variant="danger"
                                    disabled={
                                      lnkBioBusyId === product.id || editBusyId === product.id
                                    }
                                    onClick={() => void handleDeleteLnkBio(product)}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                    Hapus Lnk.Bio
                                  </Button>
                                ) : null}
                                <Link
                                  href="/products/lnkbio"
                                  className="inline-flex items-center gap-1 rounded-xl border border-[var(--border-hairline)] px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-[var(--bg-subtle)]"
                                >
                                  Kelola di Lnk.Bio Manager
                                </Link>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setEditingKey(null)}
                                >
                                  Batal
                                </Button>
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        <TablePagination
          tableKey={tableKey}
          totalItems={items.length}
          page={safePage}
          pageSize={pageSize}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <nav
        aria-label="Submenu Produk"
        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-700/80 bg-[var(--bg-surface)] p-2"
      >
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-pressed={activeMode === 'discovery'}
            onClick={() => setActiveMode('discovery')}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 ${
              activeMode === 'discovery'
                ? 'border border-teal-400/40 bg-gradient-to-r from-teal-600 to-sky-600 text-white shadow-sm'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Product Discovery</span>
            <span className="rounded-full bg-slate-950/60 px-2 py-0.5 text-[10px] font-bold tabular-nums text-teal-200">
              {candidateProductsAll.length}
            </span>
          </button>

          <button
            type="button"
            aria-pressed={activeMode === 'curation'}
            onClick={() => setActiveMode('curation')}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
              activeMode === 'curation'
                ? 'border border-emerald-400/40 bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-sm'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'
            }`}
          >
            <BookmarkCheck className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Produk Kurasi</span>
            <span className="rounded-full bg-slate-950/60 px-2 py-0.5 text-[10px] font-bold tabular-nums text-emerald-200">
              {curatedProductsAll.length}
            </span>
          </button>
        </div>

        <span className="px-2 text-[11px] text-[var(--text-muted)]">
          Hemat token Kalodata: hasil pencarian tersimpan permanen di Product Discovery.
        </span>
      </nav>

      {actionNotice ? (
        <div
          role="status"
          className="flex items-start justify-between gap-3 rounded-xl border border-emerald-500/40 bg-emerald-950/55 px-4 py-3 text-xs text-emerald-200"
        >
          <span>{actionNotice}</span>
          <button
            type="button"
            onClick={() => setActionNotice(null)}
            className="font-semibold underline"
          >
            Tutup
          </button>
        </div>
      ) : null}

      {actionError ? (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-xl border border-rose-500/40 bg-rose-950/55 px-4 py-3 text-xs text-rose-200"
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

      {activeMode === 'discovery' ? (
        <div className="space-y-6">
          <Card className="border-teal-500/30 bg-gradient-to-br from-slate-900 via-teal-950/35 to-sky-950/35">
            <CardHeader
              title="Kalodata Product Discovery"
              subtitle="Cari produk Kalodata OpenAPI dan simpan otomatis ke database agar tidak perlu melakukan get data berulang"
            />
            <form
              onSubmit={handleSearchAndSave}
              className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end"
            >
              <div className="lg:col-span-2">
                <label
                  htmlFor="kalodata-niche"
                  className="block text-xs font-medium text-[var(--text-secondary)]"
                >
                  Keyword / Niche
                </label>
                <input
                  id="kalodata-niche"
                  value={niche}
                  onChange={(e) => setNiche(e.target.value)}
                  placeholder="mis. skincare"
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-emerald-400 focus:outline-none"
                />
              </div>
              <div>
                <label
                  htmlFor="kalodata-max-price"
                  className="block text-xs font-medium text-[var(--text-secondary)]"
                >
                  Maks. Harga (Rp, Opsional)
                </label>
                <input
                  id="kalodata-max-price"
                  type="number"
                  min="1"
                  value={maxPriceInput}
                  onChange={(e) => setMaxPriceInput(e.target.value)}
                  placeholder="Tanpa batas"
                  className={`mt-1 w-full rounded-xl border border-slate-700 bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-emerald-400 focus:outline-none ${NO_SPINNER_INPUT_CLASS}`}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label
                    htmlFor="kalodata-min-rating"
                    className="block text-xs font-medium text-[var(--text-secondary)]"
                  >
                    Min. Rating
                  </label>
                  <input
                    id="kalodata-min-rating"
                    type="number"
                    step="0.1"
                    min="0"
                    max="5"
                    value={minRatingInput}
                    onChange={(e) => setMinRatingInput(e.target.value)}
                    className={`mt-1 w-full rounded-xl border border-slate-700 bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-emerald-400 focus:outline-none ${NO_SPINNER_INPUT_CLASS}`}
                  />
                </div>
                <div>
                  <label
                    htmlFor="kalodata-limit"
                    className="block text-xs font-medium text-[var(--text-secondary)]"
                  >
                    Limit
                  </label>
                  <input
                    id="kalodata-limit"
                    type="number"
                    min="1"
                    max="50"
                    value={limitInput}
                    onChange={(e) => setLimitInput(e.target.value)}
                    className={`mt-1 w-full rounded-xl border border-slate-700 bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-emerald-400 focus:outline-none ${NO_SPINNER_INPUT_CLASS}`}
                  />
                </div>
              </div>
              <div>
                <Button
                  type="submit"
                  disabled={syncing}
                  className="w-full !bg-gradient-to-r !from-teal-600 !to-emerald-600 !text-white hover:!from-teal-500 hover:!to-emerald-500"
                >
                  {syncing ? 'Mencari & Menyimpan...' : 'Cari & Simpan Kalodata'}
                </Button>
              </div>
            </form>
          </Card>

          {latestSearchProducts.length > 0 ? (
            <section aria-labelledby="heading-new-search" className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-teal-500/40 bg-gradient-to-r from-teal-950/50 via-slate-900 to-sky-950/40 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2.5">
                  <Sparkles className="h-4 w-4 text-teal-300" aria-hidden="true" />
                  <div>
                    <h2
                      id="heading-new-search"
                      className="text-sm font-bold text-[var(--text-primary)]"
                    >
                      Hasil Pencarian Baru: &quot;{latestSearchNiche}&quot;
                    </h2>
                    <p className="text-[11px] text-[var(--text-secondary)]">
                      {latestSearchProducts.length} produk hasil get terbaru ({latestSearchSyncedCount}{' '}
                      baru disimpan ke database) — terpisah dari riwayat data sebelumnya.
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setLatestSearchCandidates([])}
                >
                  Gabungkan ke Tabel Tersimpan
                </Button>
              </div>

              {renderProductTable({
                tableKey: 'new-search',
                items: latestSearchProducts,
                page: newSearchPage,
                pageSize: newSearchPageSize,
                captionText: `Hasil Pencarian Kalodata Terbaru (${latestSearchNiche})`,
                onPageChange: setNewSearchPage,
                onPageSizeChange: (nextSize) => {
                  setNewSearchPageSize(nextSize);
                  setNewSearchPage(1);
                },
              })}
            </section>
          ) : null}

          <section aria-labelledby="heading-saved-discovery" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-700/80 bg-gradient-to-r from-slate-900 via-teal-950/35 to-sky-950/35 px-4 py-3">
              <div className="flex items-start gap-2.5">
                <Database
                  className="mt-0.5 h-4 w-4 shrink-0 text-sky-300"
                  aria-hidden="true"
                />
                <div>
                  <h2
                    id="heading-saved-discovery"
                    className="text-sm font-bold text-[var(--text-primary)]"
                  >
                    Data Discovery Tersimpan (Sudah Di-get Sebelumnya)
                  </h2>
                  <p className="text-[11px] text-[var(--text-secondary)]">
                    Data kandidat dari pencarian sebelumnya yang tersimpan di database — kurasi kapan saja tanpa memotong kuota token Kalodata.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {discoveryCategoryGroups.length > 0 ? (
                  <div className="flex items-center gap-2">
                    <label
                      htmlFor="l1-category-filter-discovery"
                      className="text-xs font-semibold text-[var(--text-secondary)] whitespace-nowrap"
                    >
                      Kategori L1:
                    </label>
                    <select
                      id="l1-category-filter-discovery"
                      aria-label="Filter Kategori L1"
                      value={activeDiscoveryCategory}
                      onChange={(e) => {
                        setDiscoveryCategoryFilter(e.target.value);
                        setSavedPage(1);
                      }}
                      className="rounded-xl border border-slate-700 bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] focus:border-teal-400 focus:outline-none"
                    >
                      <option value="ALL">
                        Semua Kategori ({savedDiscoveryPool.length})
                      </option>
                      {discoveryCategoryGroups.map((group) => (
                        <option key={group.key} value={group.key}>
                          {group.key} ({group.count})
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}

                {activeDiscoveryCategory !== 'ALL' &&
                nichesInActiveDiscoveryCategory.length === 1 ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={bulkBusy || syncing}
                    onClick={() =>
                      void handleRefreshNicheGroup(
                        nichesInActiveDiscoveryCategory[0]!,
                        savedDiscoveryInCategory.length
                      )
                    }
                  >
                    <RefreshCw
                      className="h-3.5 w-3.5 text-teal-400"
                      aria-hidden="true"
                    />
                    Perbarui Metrik
                  </Button>
                ) : null}

                {onDeleteProduct && savedDiscoveryInCategory.length > 0 ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={bulkBusy}
                    onClick={() =>
                      void handleDeleteMany(
                        savedDiscoveryInCategory,
                        `Kandidat ${activeDiscoveryCategory === 'ALL' ? 'Semua Kategori' : activeDiscoveryCategory}`
                      )
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5 text-rose-400" aria-hidden="true" />
                    Bersihkan Kandidat ({savedDiscoveryInCategory.length})
                  </Button>
                ) : null}

                {onDeleteProduct &&
                activeDiscoveryCategory !== 'ALL' &&
                savedDiscoveryInCategory.length > 0 ? (
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={bulkBusy}
                    onClick={() =>
                      void handleDeleteMany(
                        savedDiscoveryInCategory,
                        `Kategori ${activeDiscoveryCategory}`
                      )
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Hapus Kategori
                  </Button>
                ) : null}

                <span className="rounded-full border border-teal-500/30 bg-teal-950/60 px-2.5 py-1 text-xs font-semibold text-teal-200">
                  {visibleSavedDiscoveryProducts.length} produk
                </span>

                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-[var(--text-secondary)]"
                    aria-hidden="true"
                  />
                  <input
                    id="search-saved-discovery"
                    type="search"
                    aria-label="Cari data discovery tersimpan"
                    value={discoverySearch}
                    onChange={(e) => {
                      setDiscoverySearch(e.target.value);
                      setSavedPage(1);
                    }}
                    placeholder="Cari produk / toko / kategori..."
                    className="rounded-xl border border-slate-700 bg-[var(--bg-surface)] py-1.5 pl-8 pr-3 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:border-teal-400 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {loading ? (
              <StatePanel status="loading" title="Memuat data discovery..." />
            ) : errorMsg ? (
              <StatePanel
                status="error"
                title="Gagal memuat produk"
                description={errorMsg}
                onRetry={onRetry}
              />
            ) : visibleSavedDiscoveryProducts.length === 0 ? (
              <StatePanel
                status="empty"
                title="Belum ada data discovery tersimpan lainnya"
                description="Lakukan pencarian Kalodata di atas atau klik 'Gabungkan ke Tabel Tersimpan' setelah pencarian."
              />
            ) : (
              renderProductTable({
                tableKey: 'saved-discovery',
                items: visibleSavedDiscoveryProducts,
                page: savedPage,
                pageSize: savedPageSize,
                captionText: 'Data Discovery Kalodata Tersimpan',
                onPageChange: setSavedPage,
                onPageSizeChange: (nextSize) => {
                  setSavedPageSize(nextSize);
                  setSavedPage(1);
                },
              })
            )}
          </section>
        </div>
      ) : (
        <div className="space-y-6">
          <Card className="border-emerald-500/30 bg-gradient-to-br from-slate-900 via-emerald-950/25 to-teal-950/30">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-[var(--text-primary)]">
                  Daftar Produk Kurasi (Siap Content Studio &amp; Lnk.Bio)
                </h2>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  Semua produk di sini sudah dikurasi (`CURATED`, `ACTIVE`, `PAUSED`, atau `DROPPED`) dengan Trigger Keyword dan nomor Biolink untuk langsung masuk ke Content Studio.
                </p>
              </div>
              <Link
                href="/studio"
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-emerald-500"
              >
                <Film className="h-3.5 w-3.5" aria-hidden="true" />
                Buka Content Studio
              </Link>
            </div>
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-700/80 bg-gradient-to-r from-slate-900 via-emerald-950/25 to-teal-950/30 px-4 py-3">
            <div className="flex flex-wrap items-center gap-3">
              {curationCategoryGroups.length > 0 ? (
                <div className="flex items-center gap-2">
                  <label
                    htmlFor="l1-category-filter-curation"
                    className="text-xs font-semibold text-[var(--text-secondary)] whitespace-nowrap"
                  >
                    Kategori L1:
                  </label>
                  <select
                    id="l1-category-filter-curation"
                    aria-label="Filter Kategori L1 Kurasi"
                    value={activeCurationCategory}
                    onChange={(e) => {
                      setCurationCategoryFilter(e.target.value);
                      setCuratedPage(1);
                    }}
                    className="rounded-xl border border-slate-700 bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] focus:border-emerald-400 focus:outline-none"
                  >
                    <option value="ALL">
                      Semua Kategori ({curatedProductsAll.length})
                    </option>
                    {curationCategoryGroups.map((group) => (
                      <option key={group.key} value={group.key}>
                        {group.key} ({group.count})
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              <span className="rounded-full border border-emerald-500/30 bg-emerald-950/60 px-2.5 py-1 text-xs font-semibold text-emerald-200">
                {visibleCuratedProducts.length} produk kurasi
              </span>
            </div>

            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-[var(--text-secondary)]"
                aria-hidden="true"
              />
              <input
                id="search-curated"
                type="search"
                aria-label="Cari produk kurasi, toko, kategori, atau keyword"
                value={curationSearch}
                onChange={(e) => {
                  setCurationSearch(e.target.value);
                  setCuratedPage(1);
                }}
                placeholder="Cari produk kurasi / keyword..."
                className="rounded-xl border border-slate-700 bg-[var(--bg-surface)] py-1.5 pl-8 pr-3 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:border-emerald-400 focus:outline-none"
              />
            </div>
          </div>

          {loading ? (
            <StatePanel status="loading" title="Memuat produk kurasi..." />
          ) : errorMsg ? (
            <StatePanel
              status="error"
              title="Gagal memuat produk kurasi"
              description={errorMsg}
              onRetry={onRetry}
            />
          ) : visibleCuratedProducts.length === 0 ? (
            <StatePanel
              status="empty"
              title="Belum ada produk yang dikurasi"
              description="Buka Product Discovery untuk memilih produk kandidat, isi Shopee Shortlink & Trigger Keyword, lalu klik Set CURATED."
            />
          ) : (
            renderProductTable({
              tableKey: 'curated',
              items: visibleCuratedProducts,
              page: curatedPage,
              pageSize: curatedPageSize,
              captionText: 'Daftar Produk Kurasi Siap Content Studio & Lnk.Bio',
              onPageChange: setCuratedPage,
              onPageSizeChange: (nextSize) => {
                setCuratedPageSize(nextSize);
                setCuratedPage(1);
              },
            })
          )}
        </div>
      )}
    </div>
  );
}
