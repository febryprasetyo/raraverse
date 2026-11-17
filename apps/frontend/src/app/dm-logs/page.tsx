'use client';

import { useCallback, useEffect, useState } from 'react';
import type { DmLog } from '@ebieshop/shared';
import { AuthGuard } from '@/components/auth-guard';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader } from '@/components/ui/card';
import { StatePanel } from '@/components/ui/state-panel';
import { useAuth } from '@/lib/auth-context';

export default function DmLogsPage() {
  const { client } = useAuth();
  const [logs, setLogs] = useState<DmLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | undefined>();

  const loadLogs = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    setErrorMsg(undefined);
    try {
      setLogs(await client.listDmLogs());
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memuat DM logs');
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    if (client) void loadLogs();
  }, [client, loadLogs]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Meta Auto-DM Logs
        </h1>
        <p className="mt-1 text-sm text-slate-300">
          Riwayat komentar pemicu keyword, balasan publik, dan pengiriman DM affiliate idempoten.
        </p>
      </header>
      <AuthGuard>
        {loading ? (
          <StatePanel status="loading" title="Memuat log Comment-to-DM..." />
        ) : errorMsg ? (
          <StatePanel
            status="error"
            title="Gagal memuat DM logs"
            description={errorMsg}
            onRetry={() => void loadLogs()}
          />
        ) : logs.length === 0 ? (
          <StatePanel
            status="empty"
            title="Belum ada komentar masuk"
            description="Event webhook dari Instagram & Facebook akan tercatat di sini."
          />
        ) : (
          <Card>
            <CardHeader title="Log Eksekusi Webhook Meta" />
            <div className="divide-y divide-slate-800">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-white">
                      @{log.senderUsername ?? log.senderId}: &ldquo;{log.commentText}&rdquo;
                    </p>
                    <p className="text-xs text-slate-400">
                      {log.platform} • Keyword:{' '}
                      <span className="font-mono text-emerald-300">
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
