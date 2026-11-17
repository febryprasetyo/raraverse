'use client';

import { useCallback, useEffect, useState } from 'react';
import { AuthGuard } from '@/components/auth-guard';
import {
  DashboardOverviewContent,
  type OverviewData,
} from '@/components/dashboard-overview';
import { useAuth } from '@/lib/auth-context';

export default function HomePage() {
  const { client } = useAuth();
  const [status, setStatus] = useState<'loading' | 'empty' | 'error' | 'success'>(
    'loading'
  );
  const [data, setData] = useState<OverviewData | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | undefined>();

  const loadOverview = useCallback(
    async (silent = false) => {
      if (!client) return;
      if (!silent) {
        setStatus('loading');
      }
      setErrorMsg(undefined);
      try {
        const [products, assets, jobs, dmLogs, weekly] = await Promise.all([
          client.listProducts(),
          client.listContentAssets(),
          client.listPublishJobs(),
          client.listDmLogs(),
          client.getWeeklyEvaluation().catch(() => null),
        ]);
        if (products.length === 0 && assets.length === 0) {
          setData({ products, assets, jobs, dmLogs, weekly });
          setStatus('empty');
        } else {
          setData({ products, assets, jobs, dmLogs, weekly });
          setStatus('success');
        }
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Gagal memuat data');
        setStatus('error');
      }
    },
    [client]
  );

  useEffect(() => {
    if (!client) return;
    void loadOverview(false);
    const interval = setInterval(() => {
      void loadOverview(true);
    }, 5000);
    return () => clearInterval(interval);
  }, [client, loadOverview]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
            Affiliate Analytics Overview
          </h1>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            Pantau pendapatan, klik tautan, konversi, sumber trafik, dan pencairan komisi.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-1 text-[11px] font-medium text-[var(--text-secondary)]">
          <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
          Live • 5s
        </div>
      </header>
      <AuthGuard>
        <DashboardOverviewContent
          state={status}
          data={data}
          errorMsg={errorMsg}
          onRetry={() => void loadOverview(false)}
        />
      </AuthGuard>
    </div>
  );
}
