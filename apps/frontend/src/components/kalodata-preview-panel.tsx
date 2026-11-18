'use client';

import { Check, Save, Star, X } from 'lucide-react';
import type { KalodataCandidate } from '@ebieshop/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import {
  formatCompactCount,
  formatCompactIdr,
  formatExactIdr,
} from '@/lib/kalodata-format';

export interface KalodataPreviewPanelProps {
  niche: string;
  candidates: KalodataCandidate[];
  existingKalodataIds: Set<string>;
  selectedIds: Set<string>;
  saving: boolean;
  onToggleSelect: (kalodataProductId: string) => void;
  onToggleSelectAll: () => void;
  onSaveSelected: () => void;
  onSaveSingle: (candidate: KalodataCandidate) => void;
  onClose: () => void;
}

export function KalodataPreviewPanel({
  niche,
  candidates,
  existingKalodataIds,
  selectedIds,
  saving,
  onToggleSelect,
  onToggleSelectAll,
  onSaveSelected,
  onSaveSingle,
  onClose,
}: KalodataPreviewPanelProps) {
  const allSelected =
    candidates.length > 0 &&
    candidates.every((c) => selectedIds.has(c.kalodataProductId));

  return (
    <Card className="border-emerald-300 dark:border-emerald-800/70">
      <CardHeader
        title={`Preview Hasil Pencarian Kalodata (${candidates.length} produk — keyword: "${niche}")`}
        subtitle="Belum disimpan ke database. Centang produk yang diinginkan lalu klik Simpan Terpilih, atau simpan satuan."
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={saving || selectedIds.size === 0}
              onClick={onSaveSelected}
            >
              <Save className="h-3.5 w-3.5" aria-hidden="true" />
              {saving ? 'Menyimpan...' : `Simpan Terpilih (${selectedIds.size})`}
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose} disabled={saving}>
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              Tutup Preview
            </Button>
          </div>
        }
      />

      <div className="overflow-x-auto rounded-xl border border-[var(--border-hairline)]">
        <table className="min-w-full border-collapse text-left text-xs">
          <caption className="sr-only">
            Preview hasil pencarian Kalodata untuk keyword {niche}
          </caption>
          <thead className="border-b border-[var(--border-hairline)] bg-[var(--bg-subtle)] text-[11px] font-semibold text-[var(--text-secondary)]">
            <tr>
              <th scope="col" className="px-3 py-2.5 text-center">
                <input
                  type="checkbox"
                  aria-label="Pilih semua kandidat Kalodata"
                  checked={allSelected}
                  onChange={onToggleSelectAll}
                  className="h-4 w-4 rounded border-slate-300 accent-emerald-600"
                />
              </th>
              <th scope="col" className="min-w-[260px] px-3 py-2.5">
                Info Produk
              </th>
              <th scope="col" className="px-3 py-2.5 whitespace-nowrap">
                Pendapatan & Kanal
              </th>
              <th scope="col" className="px-3 py-2.5 whitespace-nowrap">
                Penjualan
              </th>
              <th scope="col" className="px-3 py-2.5 whitespace-nowrap">
                Rating & Komisi
              </th>
              <th scope="col" className="px-3 py-2.5 whitespace-nowrap">
                Video Ref
              </th>
              <th scope="col" className="px-3 py-2.5 whitespace-nowrap">
                Aksi
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-hairline)] bg-[var(--bg-surface)]">
            {candidates.map((c) => {
              const isSelected = selectedIds.has(c.kalodataProductId);
              const alreadySaved = existingKalodataIds.has(c.kalodataProductId);
              const revenueVal = c.revenueExactIdr ?? c.weeklyRevenueIdr;

              return (
                <tr key={c.kalodataProductId} className="align-top">
                  <td className="px-3 py-3 text-center">
                    <input
                      type="checkbox"
                      aria-label={`Pilih ${c.name}`}
                      checked={isSelected}
                      onChange={() => onToggleSelect(c.kalodataProductId)}
                      className="h-4 w-4 rounded border-slate-300 accent-emerald-600"
                    />
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-start gap-2.5">
                      {c.imageUrl ? (
                        <img
                          src={c.imageUrl}
                          alt={c.name}
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          className="h-12 w-12 shrink-0 rounded-lg border border-[var(--border-hairline)] object-cover"
                        />
                      ) : null}
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-1">
                          {c.sellerName ? (
                            <span className="rounded bg-[var(--bg-subtle)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--text-secondary)]">
                              {c.sellerName}
                            </span>
                          ) : null}
                          {alreadySaved ? (
                            <Badge tone="info">Sudah Tersimpan</Badge>
                          ) : (
                            <Badge tone="success">Baru</Badge>
                          )}
                        </div>
                        <div className="line-clamp-2 font-semibold text-[var(--text-primary)]">
                          {c.name}
                        </div>
                        <div className="font-mono text-[11px] font-bold text-[var(--text-primary)]">
                          {formatExactIdr(c.unitPriceExactIdr ?? c.priceIdr)}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <div className="font-bold tabular-nums text-[var(--text-primary)]">
                      {formatCompactIdr(revenueVal)}
                    </div>
                    <div className="mt-1 space-y-0.5 text-[10px] tabular-nums text-[var(--text-secondary)]">
                      <div>Livestream: {formatCompactIdr(c.liveRevenueIdr)}</div>
                      <div>Video: {formatCompactIdr(c.videoRevenueIdr)}</div>
                      <div>Kartu Produk: {formatCompactIdr(c.showcaseRevenueIdr)}</div>
                    </div>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap tabular-nums">
                    <div className="font-semibold text-[var(--text-primary)]">
                      {formatCompactCount(c.weeklyUnitsSold)}
                    </div>
                    <div className="text-[10px] text-[var(--text-secondary)]">
                      {c.weeklyUnitsSold.toLocaleString('id-ID')} terjual
                    </div>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <div className="inline-flex items-center gap-1 font-semibold text-[var(--text-primary)]">
                      <Star className="h-3 w-3 fill-amber-400 text-amber-500" aria-hidden="true" />
                      <span>{c.rating.toFixed(1)}</span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-[var(--text-secondary)]">
                      Komisi {c.commissionRatePct}% {c.isCommissionXtra ? '(XTRA)' : ''}
                    </div>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-[var(--text-secondary)]">
                    {c.referenceVideos.length} video
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <Button
                      size="sm"
                      variant={alreadySaved ? 'secondary' : 'primary'}
                      disabled={saving}
                      onClick={() => onSaveSingle(c)}
                    >
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      {alreadySaved ? 'Perbarui' : 'Simpan'}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
