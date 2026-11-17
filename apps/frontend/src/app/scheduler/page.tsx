'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ContentAsset, DmLog, PublishJobRecord } from '@ebieshop/shared';
import { AuthGuard } from '@/components/auth-guard';
import { SchedulerBoard } from '@/components/scheduler-board';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader } from '@/components/ui/card';
import { StatePanel } from '@/components/ui/state-panel';
import { useAuth } from '@/lib/auth-context';

export default function SchedulerPage() {
  const { client } = useAuth();
  const [activeTab, setActiveTab] = useState<'queue' | 'dm'>('queue');
  const [jobs, setJobs] = useState<PublishJobRecord[]>([]);
  const [approvedAssets, setApprovedAssets] = useState<ContentAsset[]>([]);
  const [dmLogs, setDmLogs] = useState<DmLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | undefined>();

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('tab') === 'dm') {
        setActiveTab('dm');
      }
    }
  }, []);

  const loadData = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    setErrorMsg(undefined);
    try {
      const [jobList, assetList, dmList] = await Promise.all([
        client.listPublishJobs(),
        client.listContentAssets('APPROVED'),
        client.listDmLogs(),
      ]);
      setJobs(jobList);
      setApprovedAssets(assetList);
      setDmLogs(dmList);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memuat jadwal');
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    if (client) void loadData();
  }, [client, loadData]);

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <header>
        <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
          Scheduler & Meta Auto-DM
        </h1>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
          Pantau antrean BullMQ lintas platform dan riwayat Comment-to-DM affiliate.
        </p>
      </header>

      <AuthGuard>
        <div
          role="tablist"
          aria-label="Tab Scheduler dan DM"
          className="inline-flex rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'queue'}
            onClick={() => setActiveTab('queue')}
            className={`rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              activeTab === 'queue'
                ? 'bg-slate-900 text-white dark:bg-emerald-600'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            Antrean Publish ({jobs.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'dm'}
            onClick={() => setActiveTab('dm')}
            className={`rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              activeTab === 'dm'
                ? 'bg-slate-900 text-white dark:bg-emerald-600'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            Meta Auto-DM ({dmLogs.length})
          </button>
        </div>

        {activeTab === 'queue' ? (
          <SchedulerBoard
            jobs={jobs}
            approvedAssets={approvedAssets}
            loading={loading}
            errorMsg={errorMsg}
            onRetry={() => void loadData()}
            onSchedule={async (input) => {
              if (!client) return;
              await client.schedulePublishJobs(input);
              await loadData();
            }}
          />
        ) : loading ? (
          <StatePanel status="loading" title="Memuat log Comment-to-DM..." />
        ) : errorMsg ? (
          <StatePanel
            status="error"
            title="Gagal memuat DM logs"
            description={errorMsg}
            onRetry={() => void loadData()}
          />
        ) : dmLogs.length === 0 ? (
          <StatePanel
            status="empty"
            title="Belum ada komentar masuk"
            description="Event webhook dari Instagram & Facebook akan tercatat di sini."
          />
        ) : (
          <Card>
            <CardHeader title="Log Eksekusi Webhook Meta" />
            <div className="divide-y divide-[var(--border-hairline)]">
              {dmLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-[var(--text-primary)]">
                      @{log.senderUsername ?? log.senderId}: &ldquo;{log.commentText}&rdquo;
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {log.platform} • Keyword:{' '}
                      <span className="font-mono text-emerald-700 dark:text-emerald-400">
                        {log.matchedKeyword ?? '-'}
                      </span>{' '}
                      • Reply: {log.publicReplySent ? 'Ya' : 'Tidak'} • DM:{' '}
                      {log.dmSent ? 'Terkirim' : 'Tidak'}
                    </p>
                  </div>
                  <Badge
                    tone={
                      log.status === 'SENT'
                        ? 'success'
                        : log.status === 'FAILED'
                          ? 'danger'
                          : 'neutral'
                    }
                  >
                    {log.status}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>
        )}
      </AuthGuard>
    </div>
  );
}
