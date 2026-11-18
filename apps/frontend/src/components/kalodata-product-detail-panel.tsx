'use client';

import { ExternalLink } from 'lucide-react';
import type { KalodataCategory, Product } from '@ebieshop/shared';
import { Badge } from '@/components/ui/badge';
import {
  formatCompactIdr,
  formatExactIdr,
  formatRatioPct,
  formatSignedPct,
} from '@/lib/kalodata-format';

function formatCategory(cat?: KalodataCategory): string {
  if (!cat) return '-';
  return `${cat.categoryName} (${cat.categoryId})`;
}

function DetailField({
  apiKey,
  label,
  value,
  mono = false,
}: {
  apiKey: string;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-2">
      <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--text-secondary)]">
        <span className="font-medium">{label}</span>
        <code className="rounded bg-[var(--bg-subtle)] px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)]">
          {apiKey}
        </code>
      </div>
      <div
        className={`mt-1 break-all text-xs font-semibold text-[var(--text-primary)] ${
          mono ? 'font-mono tabular-nums' : ''
        }`}
      >
        {value}
      </div>
    </div>
  );
}

export function KalodataProductDetailPanel({ product }: { product: Product }) {
  const snapshot = product.kalodataSnapshot;
  const videos = snapshot?.referenceVideos ?? [];
  const legacyUrls = snapshot?.referenceVideoUrls ?? [];

  return (
    <div className="space-y-5 rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-canvas)] p-4">
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-[var(--text-primary)]">
              Detail Product
            </h3>
            <p className="text-xs text-[var(--text-secondary)]">
              Seluruh 18 field metrik produk Kalodata, seller, kategori 3 level, dan metadata kurasi.
            </p>
          </div>
          {snapshot?.syncedAt ? (
            <Badge tone="info">
              Synced: {new Date(snapshot.syncedAt).toLocaleString('id-ID')}
            </Badge>
          ) : null}
        </div>

        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <DetailField
            apiKey="product_id"
            label="ID Produk Kalodata"
            value={product.kalodataProductId ?? '-'}
            mono
          />
          <DetailField apiKey="product_name" label="Nama Produk" value={product.name} />
          <DetailField
            apiKey="unit_price"
            label="Harga Unit Eksak"
            value={
              snapshot?.unitPriceExactIdr !== undefined
                ? `${formatExactIdr(snapshot.unitPriceExactIdr)} (raw: ${snapshot.unitPriceExactIdr})`
                : formatExactIdr(product.priceIdr)
            }
            mono
          />
          <DetailField
            apiKey="revenue"
            label="Total Pendapatan (7 Hari)"
            value={
              snapshot?.revenueExactIdr !== undefined
                ? `${formatExactIdr(snapshot.revenueExactIdr)} (${formatCompactIdr(snapshot.revenueExactIdr)})`
                : formatExactIdr(snapshot?.weeklyRevenueIdr)
            }
            mono
          />
          <DetailField
            apiKey="revenue_growth_rate"
            label="Tingkat Pertumbuhan"
            value={formatSignedPct(snapshot?.revenueGrowthRatePct)}
            mono
          />
          <DetailField
            apiKey="sales_volumn"
            label="Total Penjualan"
            value={
              snapshot?.weeklyUnitsSold !== undefined
                ? `${snapshot.weeklyUnitsSold.toLocaleString('id-ID')} unit`
                : '-'
            }
            mono
          />
          <DetailField
            apiKey="commission_rate"
            label="Komisi Affiliate"
            value={`${product.commissionRatePct}% ${product.isCommissionXtra ? '(XTRA)' : ''}`.trim()}
            mono
          />
          <DetailField
            apiKey="live_revenue"
            label="Pendapatan Livestream"
            value={formatExactIdr(snapshot?.liveRevenueIdr)}
            mono
          />
          <DetailField
            apiKey="video_revenue"
            label="Pendapatan Video"
            value={formatExactIdr(snapshot?.videoRevenueIdr)}
            mono
          />
          <DetailField
            apiKey="showcase_revenue"
            label="Pendapatan Kartu Produk"
            value={formatExactIdr(snapshot?.showcaseRevenueIdr)}
            mono
          />
          <DetailField
            apiKey="launch_date"
            label="Tanggal Rilis Produk"
            value={snapshot?.launchDate ?? '-'}
            mono
          />
          <DetailField
            apiKey="seller_id"
            label="ID Toko / Seller"
            value={snapshot?.sellerId ?? '-'}
            mono
          />
          <DetailField
            apiKey="seller_name"
            label="Nama Toko / Seller"
            value={`${snapshot?.sellerName ?? '-'} ${product.isOfficialStore ? '(Official)' : ''}`.trim()}
          />
          <DetailField
            apiKey="sku_count"
            label="Jumlah Varian SKU"
            value={snapshot?.skuCount ?? '-'}
            mono
          />
          <DetailField
            apiKey="pri_category"
            label="Kategori Utama (L1)"
            value={formatCategory(snapshot?.priCategory)}
          />
          <DetailField
            apiKey="sec_category"
            label="Sub-Kategori (L2)"
            value={formatCategory(snapshot?.secCategory)}
          />
          <DetailField
            apiKey="ter_category"
            label="Kategori Detail (L3)"
            value={formatCategory(snapshot?.terCategory)}
          />
          <DetailField
            apiKey="master_image_url"
            label="URL Gambar Utama"
            value={snapshot?.imageUrl ?? '-'}
            mono
          />
          <DetailField
            apiKey="rating"
            label="Penilaian Produk"
            value={`${product.rating.toFixed(2)} / 5.00`}
            mono
          />
          <DetailField
            apiKey="niche"
            label="Keyword / Niche"
            value={product.niche}
            mono
          />
          <DetailField
            apiKey="triggerKeyword"
            label="Trigger Keyword & Biolink"
            value={`${product.triggerKeyword} • Biolink #${product.biolinkNumber}`}
            mono
          />
          <DetailField
            apiKey="affiliateUrls.lnkBioId"
            label="Status Lnk.Bio & Shortlink Affiliate"
            value={
              [
                product.affiliateUrls.lnkBioId
                  ? `Lnk.Bio ID: ${product.affiliateUrls.lnkBioId}`
                  : 'Belum sinkron ke Lnk.Bio',
                product.affiliateUrls.shopeeShortlink,
              ]
                .filter(Boolean)
                .join(' • ')
            }
            mono
          />
          <DetailField
            apiKey="rawMediaDir"
            label="Folder Media Mentah"
            value={`${product.rawMediaDir} (${product.rawMediaClipCount} klip)`}
            mono
          />
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-bold text-[var(--text-primary)]">
          Detail Video GMV Tertinggi (Kalodata OpenAPI `/video/rank` — {videos.length} Video)
        </h3>
        {videos.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border-hairline)] bg-[var(--bg-surface)] px-4 py-3 text-xs text-[var(--text-secondary)]">
            {legacyUrls.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                <span>URL Video Tersimpan:</span>
                {legacyUrls.map((url, idx) => (
                  <a
                    key={url}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-emerald-700 underline dark:text-emerald-400"
                  >
                    Video #{idx + 1}
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                ))}
              </div>
            ) : (
              'Tidak ada data video terkait yang ditemukan dari Kalodata API.'
            )}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)]">
            <table className="min-w-full border-collapse text-left text-xs">
              <caption className="sr-only">
                Rincian metrik 17 field video Kalodata untuk {product.name}
              </caption>
              <thead className="border-b border-[var(--border-hairline)] bg-[var(--bg-subtle)] text-[11px] font-semibold text-[var(--text-secondary)]">
                <tr>
                  <th scope="col" className="px-3 py-2 whitespace-nowrap">Video ID & Judul</th>
                  <th scope="col" className="px-3 py-2 whitespace-nowrap">Creator & Debut</th>
                  <th scope="col" className="px-3 py-2 whitespace-nowrap">Pendapatan</th>
                  <th scope="col" className="px-3 py-2 whitespace-nowrap">Views</th>
                  <th scope="col" className="px-3 py-2 whitespace-nowrap">Growth</th>
                  <th scope="col" className="px-3 py-2 whitespace-nowrap">ROAS Iklan</th>
                  <th scope="col" className="px-3 py-2 whitespace-nowrap">Interaksi (Like/Share/Komen)</th>
                  <th scope="col" className="px-3 py-2 whitespace-nowrap">Rasio Iklan (Rev / View)</th>
                  <th scope="col" className="px-3 py-2 whitespace-nowrap">Tipe & Tanggal Rilis</th>
                  <th scope="col" className="px-3 py-2 whitespace-nowrap">Tautan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-hairline)]">
                {videos.map((v) => (
                  <tr key={v.videoId} className="align-top">
                    <td className="max-w-60 px-3 py-2.5">
                      <div className="font-mono text-[11px] font-semibold text-[var(--text-primary)]">
                        {v.videoId}
                      </div>
                      <div className="mt-0.5 text-xs text-[var(--text-secondary)]">
                        {v.videoTitle || '(Tanpa judul)'}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div className="font-medium text-[var(--text-primary)]">
                        {v.belongedCreatorHandle ? `@${v.belongedCreatorHandle}` : '-'}
                      </div>
                      <div className="font-mono text-[11px] text-[var(--text-secondary)]">
                        ID: {v.belongedCreatorId ?? '-'}
                      </div>
                      <div className="text-[11px] text-[var(--text-secondary)]">
                        Debut: {v.creatorDebut ?? '-'}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap font-mono tabular-nums text-[var(--text-primary)]">
                      {formatExactIdr(v.revenue)}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap font-mono tabular-nums text-[var(--text-primary)]">
                      {v.views !== undefined ? v.views.toLocaleString('id-ID') : '-'}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap font-mono tabular-nums">
                      <span
                        className={
                          (v.revenueGrowthRate ?? 0) > 0
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : (v.revenueGrowthRate ?? 0) < 0
                              ? 'text-rose-700 dark:text-rose-400'
                              : 'text-[var(--text-secondary)]'
                        }
                      >
                        {formatSignedPct(v.revenueGrowthRate)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap font-mono tabular-nums text-[var(--text-primary)]">
                      {v.adsRoas !== undefined ? v.adsRoas.toFixed(2) : '-'}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap font-mono tabular-nums text-[var(--text-primary)]">
                      <div>Like: {v.diggCount?.toLocaleString('id-ID') ?? '-'}</div>
                      <div>Share: {v.shareCount?.toLocaleString('id-ID') ?? '-'}</div>
                      <div>Komen: {v.commentCount?.toLocaleString('id-ID') ?? '-'}</div>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap font-mono tabular-nums text-[var(--text-primary)]">
                      <div>Rev: {formatRatioPct(v.adRevenueRatio)}</div>
                      <div>View: {formatRatioPct(v.adViewRatio)}</div>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div className="flex flex-wrap gap-1">
                        <Badge tone={v.ad === 1 ? 'info' : 'neutral'}>
                          {v.ad === 1 ? 'Ad: Ya (1)' : `Ad: Tidak (${v.ad ?? 0})`}
                        </Badge>
                        <Badge tone={v.aiVideo === 1 ? 'warning' : 'neutral'}>
                          {v.aiVideo === 1 ? 'AI: Ya (1)' : `AI: Tidak (${v.aiVideo ?? 0})`}
                        </Badge>
                      </div>
                      <div className="mt-1 font-mono text-[11px] text-[var(--text-secondary)]">
                        {v.publishDate ?? '-'}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {v.videoUrl ? (
                        <a
                          href={v.videoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-2.5 py-1 text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                        >
                          Buka TikTok
                          <ExternalLink className="h-3 w-3" aria-hidden="true" />
                        </a>
                      ) : (
                        '-'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
