'use client';

import { ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { LnkBioOverview, ThreadsOverview } from '@ebieshop/shared';
import { AuthGuard } from '@/components/auth-guard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { StatePanel } from '@/components/ui/state-panel';
import type { SystemHealth } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';

export default function HealthPage() {
  const { client } = useAuth();
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [lnkBioOverview, setLnkBioOverview] = useState<LnkBioOverview | null>(null);
  const [threadsOverview, setThreadsOverview] = useState<ThreadsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | undefined>();
  const [oauthBusy, setOauthBusy] = useState(false);
  const [oauthNotice, setOauthNotice] = useState<string | null>(null);
  const [oauthError, setOauthError] = useState<string | null>(null);

  const loadHealth = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    setErrorMsg(undefined);
    try {
      const [sysHealth, overview, tOverview] = await Promise.all([
        client.getSystemHealth(),
        client.getLnkBioOverview().catch(() => null),
        client.getThreadsOverview().catch(() => null),
      ]);
      setHealth(sysHealth);
      setLnkBioOverview(overview);
      setThreadsOverview(tOverview);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memuat status sistem');
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    if (client) void loadHealth();
  }, [client, loadHealth]);

  async function handleConnectLnkBio() {
    if (!client) return;
    setOauthBusy(true);
    setOauthNotice(null);
    setOauthError(null);
    try {
      const res = await client.connectLnkBioAuth({ mode: 'client_credentials' });
      setOauthNotice(
        `Integrasi Lnk.Bio (@${res.profile.username}) berhasil dihubungkan / diperbarui.`
      );
      await loadHealth();
    } catch (err) {
      setOauthError(
        err instanceof Error ? err.message : 'Gagal menghubungkan OAuth Lnk.Bio'
      );
    } finally {
      setOauthBusy(false);
    }
  }

  const lnkBioProfile = lnkBioOverview?.profile;
  const lnkBioTone =
    lnkBioProfile?.tokenStatus === 'NEEDS_REAUTH'
      ? 'danger'
      : lnkBioProfile?.tokenStatus === 'EXPIRING_SOON'
        ? 'warning'
        : 'success';

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <header>
        <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
          System Health
        </h1>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
          Pusat kontrol integrasi: status heartbeat Node Lokal, token OAuth 2.0, akun Lnk.Bio, dan
          sesi storageState.json.
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
              <p className="text-xs text-[var(--text-secondary)]">
                Mode Sumber Data:{' '}
                <span className="font-mono font-semibold text-[var(--text-primary)]">
                  {health.dataSourceMode}
                </span>
              </p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Heartbeat terakhir:{' '}
                {new Date(health.lastHeartbeatAt).toLocaleString('id-ID')}
              </p>
            </Card>

            <Card>
              <CardHeader title="Token OAuth 2.0" />
              <div className="space-y-2">
                {health.oauthProviders.map((p) => (
                  <div key={p.provider} className="flex items-center justify-between text-sm">
                    <span className="font-medium uppercase text-[var(--text-primary)]">
                      {p.provider}
                    </span>
                    <Badge
                      tone={
                        p.status === 'HEALTHY'
                          ? 'success'
                          : p.status === 'NEEDS_REAUTH'
                            ? 'danger'
                            : 'warning'
                      }
                    >
                      {p.status} ({p.expiresInDays} hari)
                    </Badge>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader
                title="Akun & OAuth 2.0 Lnk.Bio"
                subtitle={
                  lnkBioProfile
                    ? `Username: ${lnkBioProfile.username}`
                    : 'Status koneksi akun Lnk.Bio'
                }
                action={
                  lnkBioProfile ? (
                    <Badge tone={lnkBioTone}>{lnkBioProfile.tokenStatus}</Badge>
                  ) : null
                }
              />
              {lnkBioProfile ? (
                <div className="space-y-4">
                  <div className="grid gap-3 text-xs text-[var(--text-secondary)] sm:grid-cols-2">
                    <div className="flex items-center justify-between rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3.5 py-2.5">
                      <span>Paket Lnk.Bio</span>
                      <Badge tone={lnkBioProfile.supportsGroups ? 'info' : 'neutral'}>
                        {lnkBioProfile.planTier}{' '}
                        {lnkBioProfile.supportsGroups ? '• Grup Aktif' : '• Tanpa Grup'}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3.5 py-2.5">
                      <span>Grup Tersinkron</span>
                      <span className="font-semibold text-[var(--text-primary)]">
                        {lnkBioOverview?.groups.length ?? 0} grup
                      </span>
                    </div>
                  </div>
                  {oauthNotice ? (
                    <p role="status" className="text-xs text-emerald-300">
                      {oauthNotice}
                    </p>
                  ) : null}
                  {oauthError ? (
                    <p role="alert" className="text-xs text-rose-300">
                      {oauthError}
                    </p>
                  ) : null}
                  <div>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={oauthBusy}
                      onClick={() => void handleConnectLnkBio()}
                    >
                      <ShieldCheck
                        className="h-3.5 w-3.5 text-emerald-400"
                        aria-hidden="true"
                      />
                      {oauthBusy ? 'Menghubungkan...' : 'Hubungkan / Refresh OAuth Lnk.Bio'}
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-[var(--text-muted)]">
                  Profil Lnk.Bio belum termuat.
                </p>
              )}
            </Card>

            <Card className="md:col-span-2">
              <CardHeader
                title="Akun & OAuth 2.0 Meta Threads"
                subtitle={
                  threadsOverview?.profile
                    ? `Username: @${threadsOverview.profile.username} • App ID: ${threadsOverview.profile.appId || '—'}`
                    : 'Status koneksi akun Meta Threads'
                }
                action={
                  threadsOverview?.profile ? (
                    <Badge
                      tone={
                        threadsOverview.profile.tokenStatus === 'NEEDS_REAUTH'
                          ? 'warning'
                          : 'success'
                      }
                    >
                      {threadsOverview.profile.tokenStatus}
                    </Badge>
                  ) : null
                }
              />
              {threadsOverview?.profile ? (
                <p className="text-xs text-[var(--text-secondary)]">
                  User Token:{' '}
                  <span className="font-semibold text-[var(--text-primary)]">
                    {threadsOverview.profile.hasUserToken ? 'Terhubung' : 'Belum'}
                  </span>{' '}
                  • App Token:{' '}
                  <span className="font-semibold text-[var(--text-primary)]">
                    {threadsOverview.profile.hasAppToken ? 'Terverifikasi' : 'Belum diuji'}
                  </span>
                </p>
              ) : (
                <p className="text-xs text-[var(--text-muted)]">
                  Profil Threads belum termuat.
                </p>
              )}
            </Card>

            <Card className="md:col-span-2">
              <CardHeader title="Sesi Playwright (storageState.json)" />
              <div className="grid gap-3 sm:grid-cols-2">
                {health.playwrightSessions.map((s) => (
                  <div
                    key={s.platform}
                    className="flex items-center justify-between rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-canvas)] p-3.5"
                  >
                    <span className="text-sm font-medium text-[var(--text-primary)]">
                      {s.platform}
                    </span>
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
