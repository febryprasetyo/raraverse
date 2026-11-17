'use client';

import { useCallback, useEffect, useState } from 'react';
import type { WeeklyEvaluationReport, WeeklyRecommendation } from '@ebieshop/shared';
import { AnalyticsMatrix } from '@/components/analytics-matrix';
import { AuthGuard } from '@/components/auth-guard';
import { useAuth } from '@/lib/auth-context';

export default function AnalyticsPage() {
  const { client } = useAuth();
  const [report, setReport] = useState<WeeklyEvaluationReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | undefined>();

  const loadReport = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    setErrorMsg(undefined);
    try {
      setReport(await client.getWeeklyEvaluation());
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memuat laporan');
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    if (client) void loadReport();
  }, [client, loadReport]);

  async function handleApplyRecommendation(
    productId: string,
    recommendation: WeeklyRecommendation
  ) {
    if (!client) return;
    if (recommendation === 'DROP') {
      await client.updateProduct(productId, { status: 'DROPPED' });
    } else if (recommendation === 'SCALE') {
      await client.updateProduct(productId, { status: 'ACTIVE' });
    }
    await loadReport();
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Evaluasi Performa Mingguan
        </h1>
        <p className="mt-1 text-sm text-slate-300">
          Keputusan 3-Tier (Scale / Optimize Hook / Drop) setiap hari Minggu pukul 20:00 WIB.
        </p>
      </header>
      <AuthGuard>
        <AnalyticsMatrix
          report={report}
          loading={loading}
          errorMsg={errorMsg}
          onRetry={() => void loadReport()}
          onApplyRecommendation={handleApplyRecommendation}
        />
      </AuthGuard>
    </div>
  );
}
