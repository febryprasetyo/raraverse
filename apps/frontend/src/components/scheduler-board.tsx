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
];

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
    try {
      await onSchedule({
        contentAssetId: assetId,
        platforms: selectedPlatforms,
        visibility,
      });
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
                Aset Konten (APPROVED)
              </label>
              <select
                id="sched-asset"
                value={selectedAssetId || approvedAssets[0]?.id || ''}
                onChange={(e) => setSelectedAssetId(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-2 text-sm text-[var(--text-primary)]"
              >
                {approvedAssets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.id.slice(0, 8)} — {a.scriptJson.hook.slice(0, 45)}
                  </option>
                ))}
              </select>
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
                className="mt-1 w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-2 text-sm text-[var(--text-primary)]"
              >
                <option value="PUBLIC">PUBLIC (Produksi)</option>
                <option value="PRIVATE">PRIVATE (Sandbox Fase 5)</option>
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
                    className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors ${
                      checked
                        ? 'border-slate-900 bg-slate-900 text-white dark:border-emerald-500 dark:bg-emerald-600'
                        : 'border-[var(--border-hairline)] bg-[var(--bg-canvas)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]'
                    }`}
                  >
                    {platform}
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
            {submitting ? 'Menjadwalkan...' : 'Masukkan ke Antrean BullMQ'}
          </Button>
        </form>
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
          <CardHeader title="Daftar Publish Jobs" />
          <div className="divide-y divide-[var(--border-hairline)]">
            {jobs.map((job) => (
              <div
                key={job.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div>
                  <p className="text-sm font-semibold text-[var(--text-primary)]">
                    {job.platform}{' '}
                    <span className="font-mono text-xs text-[var(--text-muted)]">
                      ({job.executionMode})
                    </span>
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">
                    Jadwal: {new Date(job.scheduledAt).toLocaleString('id-ID')} •
                    Percobaan: {job.attemptCount}
                  </p>
                  {job.lastError ? (
                    <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">
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
                  {job.status}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
