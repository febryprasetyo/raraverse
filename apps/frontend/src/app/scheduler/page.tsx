'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ContentAsset, PublishJobRecord } from '@ebieshop/shared';
import { AuthGuard } from '@/components/auth-guard';
import { SchedulerBoard } from '@/components/scheduler-board';
import { useAuth } from '@/lib/auth-context';

export default function SchedulerPage() {
  const { client } = useAuth();
  const [jobs, setJobs] = useState<PublishJobRecord[]>([]);
  const [approvedAssets, setApprovedAssets] = useState<ContentAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | undefined>();

  const loadData = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    setErrorMsg(undefined);
    try {
      const [jobList, assetList] = await Promise.all([
        client.listPublishJobs(),
        client.listContentAssets('APPROVED'),
      ]);
      setJobs(jobList);
      setApprovedAssets(assetList);
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
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Scheduler & Queue Monitor
        </h1>
        <p className="mt-1 text-sm text-slate-300">
          Pantau antrean BullMQ Official API (IG/FB/YT) dan Playwright lokal (Shopee/TikTok).
        </p>
      </header>
      <AuthGuard>
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
      </AuthGuard>
    </div>
  );
}
