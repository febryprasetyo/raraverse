'use client';

import { useState, type FormEvent } from 'react';
import type {
  ContentAsset,
  PublishJobRecord,
  TargetPlatform,
} from '@ebieshop/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { StatePanel } from '@/components/ui/state-panel';

const ALL_PLATFORMS: TargetPlatform[] = [
  'IG_REELS',
  'FB_REELS',
  'YT_SHORTS',
  'SHOPEE_VIDEO',
  'TIKTOK_STUDIO',
  'THREADS',
];

const PLATFORM_LABELS: Record<TargetPlatform, string> = {
  IG_REELS: 'Instagram Reels',
  FB_REELS: 'Facebook Reels',
  YT_SHORTS: 'YouTube Shorts',
  SHOPEE_VIDEO: 'Shopee Video',
  TIKTOK_STUDIO: 'TikTok Studio',
  THREADS: 'Threads',
};

const JOB_STATUS_LABELS: Record<PublishJobRecord['status'], string> = {
  QUEUED: 'Terjadwal',
  PROCESSING: 'Sedang Diproses',
  PUBLISHED: 'Tayang',
  FAILED: 'Gagal',
  NEEDS_MANUAL_LOGIN: 'Perlu Login Manual',
  CANCELLED: 'Dibatalkan',
};

export interface SchedulerBoardProps {
  jobs: PublishJobRecord[];
  approvedAssets: ContentAsset[];
  loading: boolean;
  errorMsg?: string;
  onRetry: () => void;
  onSchedule: (input: {
    contentAssetId: string;
    platforms: TargetPlatform[];
    visibility: 'PUBLIC' | 'PRIVATE';
  }) => Promise<void>;
}

export function SchedulerBoard({
  jobs,
  approvedAssets,
  loading,
  errorMsg,
  onRetry,
  onSchedule,
}: SchedulerBoardProps) {
  const [selectedAssetId, setSelectedAssetId] = useState(
    approvedAssets[0]?.id ?? ''
  );
  const [selectedPlatforms, setSelectedPlatforms] = useState<TargetPlatform[]>([
    'IG_REELS',
    'FB_REELS',
    'YT_SHORTS',
  ]);
  const [visibility, setVisibility] = useState<'PUBLIC' | 'PRIVATE'>('PUBLIC');
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  function togglePlatform(platform: TargetPlatform) {
    setSelectedPlatforms((prev) =>
      prev.includes(platform)
        ? prev.filter((p) => p !== platform)
        : [...prev, platform]
    );
  }

  async function handleSchedule(e: FormEvent) {
    e.preventDefault();
    const assetId = selectedAssetId || approvedAssets[0]?.id;
    if (!assetId || selectedPlatforms.length === 0) return;
    setSubmitting(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      await onSchedule({
        contentAssetId: assetId,
        platforms: selectedPlatforms,
        visibility,
      });
      setActionSuccess(
        `Jadwal publish berhasil dibuat untuk ${selectedPlatforms.length} platform.`
      );
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Gagal menjadwalkan publish'
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Jadwalkan Cross-Posting"
          subtitle="Antrean otomatis diberi jeda 12 menit antar platform untuk mencegah burst automation"
        />
        <form onSubmit={handleSchedule} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="sched-asset"
                className="block text-xs font-medium text-[var(--text-secondary)]"
              >
                Aset Konten (Disetujui)
              </label>
              <select
                id="sched-asset"
                value={selectedAssetId || approvedAssets[0]?.id || ''}
                onChange={(e) => setSelectedAssetId(e.target.value)}
                disabled={approvedAssets.length === 0}
                aria-describedby={approvedAssets.length === 0 ? 'sched-asset-empty-help' : undefined}
                className="mt-1 w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-emerald-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {approvedAssets.length === 0 ? (
                  <option value="">Belum ada aset konten yang disetujui</option>
                ) : (
                  approvedAssets.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.id.slice(0, 8)} — {a.scriptJson.hook.slice(0, 45)}
                    </option>
                  ))
                )}
              </select>
              {approvedAssets.length === 0 ? (
                <p id="sched-asset-empty-help" className="mt-1 text-[11px] text-amber-300">
                  Setujui minimal satu video di Galeri Konten agar bisa dijadwalkan.
                </p>
              ) : null}
            </div>
            <div>
              <label
                htmlFor="sched-visibility"
                className="block text-xs font-medium text-[var(--text-secondary)]"
              >
                Visibilitas
              </label>
              <select
                id="sched-visibility"
                value={visibility}
                onChange={(e) =>
                  setVisibility(e.target.value as 'PUBLIC' | 'PRIVATE')
                }
                className="mt-1 w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-emerald-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
              >
                <option value="PUBLIC">Publik (Tayang Langsung)</option>
                <option value="PRIVATE">Privat (Uji Coba)</option>
              </select>
            </div>
          </div>

          <fieldset>
            <legend className="text-xs font-medium text-[var(--text-secondary)]">
              Platform Target
            </legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {ALL_PLATFORMS.map((platform) => {
                const checked = selectedPlatforms.includes(platform);
                return (
                  <button
                    key={platform}
                    type="button"
                    aria-pressed={checked}
                    onClick={() => togglePlatform(platform)}
                    className={`cursor-pointer rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                      checked
                        ? 'border-emerald-500 bg-emerald-600 text-white'
                        : 'border-[var(--border-hairline)] bg-[var(--bg-canvas)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]'
                    }`}
                  >
                    {PLATFORM_LABELS[platform]}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <Button
            type="submit"
            disabled={
              submitting ||
              approvedAssets.length === 0 ||
              selectedPlatforms.length === 0
            }
          >
            {submitting ? 'Menjadwalkan...' : 'Jadwalkan Publish'}
          </Button>
        </form>
        {actionSuccess ? (
          <div
            role="status"
            aria-live="polite"
            className="mt-4 flex items-start justify-between gap-3 rounded-xl border border-emerald-500/40 bg-emerald-950/50 px-4 py-3 text-xs text-emerald-200"
          >
            <span>{actionSuccess}</span>
            <button
              type="button"
              onClick={() => setActionSuccess(null)}
              className="cursor-pointer font-semibold underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            >
              Tutup
            </button>
          </div>
        ) : null}
        {actionError ? (
          <div
            role="alert"
            className="mt-4 flex items-start justify-between gap-3 rounded-xl border border-rose-500/40 bg-rose-950/50 px-4 py-3 text-xs text-rose-200"
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

      {loading ? (
        <StatePanel status="loading" title="Memuat antrean publish..." />
      ) : errorMsg ? (
        <StatePanel
          status="error"
          title="Gagal memuat antrean publish"
          description={errorMsg}
          onRetry={onRetry}
        />
      ) : jobs.length === 0 ? (
        <StatePanel
          status="empty"
          title="Belum ada jadwal publish"
          description="Approve video di Content Studio lalu jadwalkan di atas."
        />
      ) : (
        <Card>
          <CardHeader title="Daftar Jadwal Publish" />
          <div className="divide-y divide-[var(--border-hairline)]">
            {jobs.map((job) => (
              <div
                key={job.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div>
                  <p className="text-sm font-semibold text-[var(--text-primary)]">
                    {PLATFORM_LABELS[job.platform]}{' '}
                    <span className="font-mono text-xs text-[var(--text-muted)]">
                      ({job.executionMode})
                    </span>
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">
                    Jadwal: {new Date(job.scheduledAt).toLocaleString('id-ID')} •
                    Percobaan: {job.attemptCount}
                  </p>
                  {job.lastError ? (
                    <p className="mt-1 text-xs text-rose-400">
                      {job.lastError}
                    </p>
                  ) : null}
                </div>
                <Badge
                  tone={
                    job.status === 'PUBLISHED'
                      ? 'success'
                      : job.status === 'FAILED' ||
                          job.status === 'NEEDS_MANUAL_LOGIN'
                        ? 'danger'
                        : 'info'
                  }
                >
                  {JOB_STATUS_LABELS[job.status]}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
