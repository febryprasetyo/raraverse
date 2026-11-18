'use client';

import { useCallback, useEffect, useState } from 'react';
import type {
  LnkBioMetricsSnapshot,
  LnkBioOverview,
  LnkBioSyncLog,
} from '@ebieshop/shared';
import { AuthGuard } from '@/components/auth-guard';
import { LnkBioManager } from '@/components/lnkbio-manager';
import { useAuth } from '@/lib/auth-context';

export default function ProductsLnkBioPage() {
  const { client } = useAuth();
  const [overview, setOverview] = useState<LnkBioOverview | null>(null);
  const [logs, setLogs] = useState<LnkBioSyncLog[]>([]);
  const [metrics, setMetrics] = useState<LnkBioMetricsSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | undefined>();

  const loadData = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    setErrorMsg(undefined);
    try {
      const [nextOverview, nextLogs, nextMetrics] = await Promise.all([
        client.getLnkBioOverview(),
        client.listLnkBioLogs({ limit: 50 }),
        client.listLnkBioMetrics({ limit: 50 }),
      ]);
      setOverview(nextOverview);
      setLogs(nextLogs);
      setMetrics(nextMetrics);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memuat data Lnk.Bio');
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    if (client) void loadData();
  }, [client, loadData]);

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <header>
        <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
          Lnk.Bio Manager & Hybrid Analytics
        </h1>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
          Kelola penjadwalan promo RFC 3339, konfirmasi hapus & bulk reorder berbasis performa,
          serta log pelacakan klik hybrid (/r/:code).
        </p>
      </header>
      <AuthGuard>
        <LnkBioManager
          overview={overview}
          logs={logs}
          metrics={metrics}
          loading={loading}
          errorMsg={errorMsg}
          onRetry={() => void loadData()}
          onSync={async () => {
            if (!client) return;
            await client.syncLnkBio();
            await loadData();
          }}
          onUpdateLink={async (productId, patch) => {
            if (!client) return;
            await client.publishLnkBioProductLink(productId, patch);
            await loadData();
          }}
          onDeleteLink={async (productId) => {
            if (!client) return;
            await client.deleteLnkBioProductLink(productId);
            await loadData();
          }}
          onReorder={async (orderedProductIds) => {
            if (!client) return;
            await client.reorderLnkBioLinks({ orderedProductIds });
            await loadData();
          }}
        />
      </AuthGuard>
    </div>
  );
}
