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

  const loadOverview = useCallback(async () => {
    if (!client) return;
    setStatus('loading');
    setErrorMsg(undefined);
    try {
      const [products, assets, jobs, dmLogs] = await Promise.all([
        client.listProducts(),
        client.listContentAssets(),
        client.listPublishJobs(),
        client.listDmLogs(),
      ]);
      if (products.length === 0 && assets.length === 0) {
        setData({ products, assets, jobs, dmLogs });
        setStatus('empty');
      } else {
        setData({ products, assets, jobs, dmLogs });
        setStatus('success');
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memuat data');
      setStatus('error');
    }
  }, [client]);

  useEffect(() => {
    if (client) {
      void loadOverview();
    }
  }, [client, loadOverview]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Dashboard Overview
        </h1>
        <p className="mt-1 text-sm text-slate-300">
          Ringkasan pipeline kurasi produk, produksi video 9:16, distribusi multi-platform, dan Auto-DM.
        </p>
      </header>
      <AuthGuard>
        <DashboardOverviewContent
          state={status}
          data={data}
          errorMsg={errorMsg}
          onRetry={() => void loadOverview()}
        />
      </AuthGuard>
    </div>
  );
}
