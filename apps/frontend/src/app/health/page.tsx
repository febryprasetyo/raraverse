'use client';

import { useCallback, useEffect, useState } from 'react';
import { AuthGuard } from '@/components/auth-guard';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader } from '@/components/ui/card';
import { StatePanel } from '@/components/ui/state-panel';
import type { SystemHealth } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';

export default function HealthPage() {
  const { client } = useAuth();
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | undefined>();

  const loadHealth = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    setErrorMsg(undefined);
    try {
      setHealth(await client.getSystemHealth());
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memuat status sistem');
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    if (client) void loadHealth();
  }, [client, loadHealth]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
          System Health
        </h1>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
          Status heartbeat Node Lokal, masa berlaku token OAuth 2.0, dan sesi storageState.json.
        </p>
      </header>
      <AuthGuard>
        {loading ? (
          <StatePanel status="loading" title="Memeriksa kesehatan sistem..." />
        ) : errorMsg || !health ? (
          <StatePanel
            status="error"
            title="Gagal memuat status kesehatan"
            description={errorMsg}
            onRetry={() => void loadHealth()}
          />
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader
                title="Node Lokal & VPS API"
                action={
                  <Badge tone={health.workerOnline ? 'success' : 'danger'}>
                    {health.workerOnline ? 'ONLINE' : 'OFFLINE'}
                  </Badge>
                }
              />
              <p className="text-xs text-slate-300">
                Mode Sumber Data: <span className="font-mono text-white">{health.dataSourceMode}</span>
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Heartbeat terakhir: {new Date(health.lastHeartbeatAt).toLocaleString('id-ID')}
              </p>
            </Card>

            <Card>
              <CardHeader title="Token OAuth 2.0" />
              <div className="space-y-2">
                {health.oauthProviders.map((p) => (
                  <div key={p.provider} className="flex items-center justify-between text-sm">
                    <span className="uppercase text-slate-200">{p.provider}</span>
                    <Badge tone={p.status === 'HEALTHY' ? 'success' : 'warning'}>
                      {p.status} ({p.expiresInDays} hari)
                    </Badge>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader title="Sesi Playwright (storageState.json)" />
              <div className="grid gap-3 sm:grid-cols-2">
                {health.playwrightSessions.map((s) => (
                  <div
                    key={s.platform}
                    className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/60 p-3"
                  >
                    <span className="text-sm font-medium text-white">{s.platform}</span>
                    <Badge tone={s.status === 'READY' ? 'success' : 'danger'}>
                      {s.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}
      </AuthGuard>
    </div>
  );
}
