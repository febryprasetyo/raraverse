'use client';

import { useState, type FormEvent } from 'react';
import type { ContentAsset, Product } from '@ebieshop/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { StatePanel } from '@/components/ui/state-panel';

export interface ContentStudioProps {
  products: Product[];
  assets: ContentAsset[];
  loading: boolean;
  errorMsg?: string;
  onRetry: () => void;
  onGenerate: (input: {
    productId: string;
    angle: string;
    ttsVoiceId: string;
  }) => Promise<void>;
  onReview: (
    assetId: string,
    decision: 'APPROVED' | 'REJECTED',
    reason?: string
  ) => Promise<void>;
}

export function ContentStudio({
  products,
  assets,
  loading,
  errorMsg,
  onRetry,
  onGenerate,
  onReview,
}: ContentStudioProps) {
  const [selectedProductId, setSelectedProductId] = useState<string>(
    products[0]?.id ?? ''
  );
  const [angle, setAngle] = useState('problem-solution');
  const [voiceId, setVoiceId] = useState('id-ID-GadisNeural');
  const [generating, setGenerating] = useState(false);
  const [selectedAssetId, setSelectedAssetId] = useState<string>(assets[0]?.id ?? '');
  const [showSafeZone, setShowSafeZone] = useState(true);

  const activeAsset =
    assets.find((a) => a.id === selectedAssetId) ?? assets[0] ?? null;

  async function handleGenerate(e: FormEvent) {
    e.preventDefault();
    const targetId = selectedProductId || products[0]?.id;
    if (!targetId) return;
    setGenerating(true);
    try {
      await onGenerate({ productId: targetId, angle, ttsVoiceId: voiceId });
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Generate Script & Render Video 9:16"
          subtitle="Buat naskah LLM terstruktur dan kirim job TTS + FFmpeg ke worker lokal"
        />
        <form onSubmit={handleGenerate} className="grid gap-3 sm:grid-cols-4 sm:items-end">
          <div>
            <label
              htmlFor="studio-product"
              className="block text-xs font-medium text-[var(--text-secondary)]"
            >
              Pilih Produk
            </label>
            <select
              id="studio-product"
              value={selectedProductId || products[0]?.id || ''}
              onChange={(e) => setSelectedProductId(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-2 text-sm text-[var(--text-primary)]"
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.triggerKeyword} — {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="studio-angle"
              className="block text-xs font-medium text-[var(--text-secondary)]"
            >
              Angle Konten
            </label>
            <input
              id="studio-angle"
              value={angle}
              onChange={(e) => setAngle(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-2 text-sm text-[var(--text-primary)]"
            />
          </div>
          <div>
            <label
              htmlFor="studio-voice"
              className="block text-xs font-medium text-[var(--text-secondary)]"
            >
              Suara TTS
            </label>
            <select
              id="studio-voice"
              value={voiceId}
              onChange={(e) => setVoiceId(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-2 text-sm text-[var(--text-primary)]"
            >
              <option value="id-ID-GadisNeural">Gadis Neural (Ramah)</option>
              <option value="id-ID-ArdiNeural">Ardi Neural (Review Teknis)</option>
            </select>
          </div>
          <Button type="submit" disabled={generating || products.length === 0}>
            {generating ? 'Memproses...' : 'Generate Konten'}
          </Button>
        </form>
      </Card>

      {loading ? (
        <StatePanel status="loading" title="Memuat aset Content Studio..." />
      ) : errorMsg ? (
        <StatePanel
          status="error"
          title="Gagal memuat aset video"
          description={errorMsg}
          onRetry={onRetry}
        />
      ) : !activeAsset ? (
        <StatePanel
          status="empty"
          title="Belum ada aset video"
          description="Generate script pertama untuk mulai merender video 9:16."
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-12">
          <div className="space-y-4 lg:col-span-7">
            <Card>
              <CardHeader
                title="Daftar Aset Konten"
                subtitle="Pilih aset untuk preview safe-zone & approval"
              />
              <div className="flex flex-wrap gap-2">
                {assets.map((asset) => (
                  <Button
                    key={asset.id}
                    size="sm"
                    variant={asset.id === activeAsset.id ? 'primary' : 'secondary'}
                    onClick={() => setSelectedAssetId(asset.id)}
                  >
                    {asset.id.slice(0, 8)} ({asset.status})
                  </Button>
                ))}
              </div>
            </Card>

            <Card>
              <CardHeader
                title="Naskah & Transkrip Aksesibel"
                subtitle={`Provider: ${activeAsset.llmProvider} • TTS: ${activeAsset.ttsVoiceId}`}
                action={<Badge tone="info">{activeAsset.status}</Badge>}
              />
              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-xs font-semibold uppercase text-[var(--text-muted)]">
                    Hook
                  </p>
                  <p className="mt-1 font-medium text-[var(--text-primary)]">
                    {activeAsset.scriptJson.hook}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-[var(--text-muted)]">
                    Voiceover Transcript
                  </p>
                  <p className="mt-1 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-canvas)] p-3 text-[var(--text-secondary)]">
                    {activeAsset.scriptJson.scriptVoiceover}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-[var(--text-muted)]">
                    Pinned Comment
                  </p>
                  <p className="mt-1 font-medium text-emerald-700 dark:text-emerald-400">
                    {activeAsset.scriptJson.pinnedComment}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button
                    size="sm"
                    onClick={() => void onReview(activeAsset.id, 'APPROVED')}
                  >
                    Approve Video
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() =>
                      void onReview(
                        activeAsset.id,
                        'REJECTED',
                        'Hook kurang kuat / perlu render ulang'
                      )
                    }
                  >
                    Reject
                  </Button>
                </div>
              </div>
            </Card>
          </div>

          <div className="lg:col-span-5">
            <Card>
              <CardHeader
                title="Preview 9:16 (1080x1920)"
                action={
                  <Button
                    size="sm"
                    variant="secondary"
                    aria-pressed={showSafeZone}
                    onClick={() => setShowSafeZone((prev) => !prev)}
                  >
                    {showSafeZone ? 'Sembunyikan Safe-Zone' : 'Tampilkan Safe-Zone'}
                  </Button>
                }
              />
              {/* 9:16 video canvas intentionally uses dark cinema frame */}
              <div className="relative mx-auto aspect-[9/16] w-full max-w-[290px] overflow-hidden rounded-2xl border border-slate-800 bg-slate-950">
                {activeAsset.videoR2Key ? (
                  <video
                    key={activeAsset.videoR2Key}
                    src={
                      process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL
                        ? `${process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL.replace(/\/$/, '')}/${activeAsset.videoR2Key}`
                        : `${(process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3001').replace(/\/$/, '')}/api/v1/assets/local-file/${activeAsset.videoR2Key}`
                    }
                    controls
                    playsInline
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center p-4 text-center">
                    <p className="text-xs font-semibold uppercase tracking-widest text-emerald-400">
                      9:16 Vertical Preview
                    </p>
                    <p className="mt-2 text-sm font-bold text-white">
                      {activeAsset.scriptJson.hook}
                    </p>
                    <p className="mt-4 text-xs text-slate-400">
                      Menunggu hasil render FFmpeg lokal...
                    </p>
                  </div>
                )}

                {showSafeZone ? (
                  <div
                    aria-label="Overlay Safe Zone TikTok dan Reels"
                    className="pointer-events-none absolute inset-0"
                  >
                    <div className="absolute bottom-24 right-2 flex h-44 w-12 items-center justify-center rounded border border-amber-400/70 bg-amber-500/15 text-[10px] font-semibold text-amber-200">
                      UI
                    </div>
                    <div className="absolute bottom-[27%] left-4 right-16 rounded border border-emerald-400/80 bg-emerald-500/15 px-2 py-1 text-center text-[11px] font-semibold text-emerald-200">
                      Subtitle Safe Zone (MarginV 520)
                    </div>
                    <div className="absolute inset-x-0 bottom-0 flex h-[20%] items-center justify-center border-t border-rose-400/60 bg-rose-500/15 text-[10px] font-semibold text-rose-200">
                      Area Caption Platform
                    </div>
                  </div>
                ) : null}
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
