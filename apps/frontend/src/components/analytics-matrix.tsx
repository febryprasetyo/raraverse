'use client';

import type { WeeklyEvaluationReport, WeeklyRecommendation } from '@ebieshop/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { StatePanel } from '@/components/ui/state-panel';

export interface AnalyticsMatrixProps {
  report: WeeklyEvaluationReport | null;
  loading: boolean;
  errorMsg?: string;
  onRetry: () => void;
  onApplyRecommendation: (
    productId: string,
    recommendation: WeeklyRecommendation
  ) => Promise<void>;
}

const RECOMMENDATION_TONE: Record<
  WeeklyRecommendation,
  'success' | 'warning' | 'danger'
> = {
  SCALE: 'success',
  OPTIMIZE_HOOK: 'warning',
  DROP: 'danger',
};

export function AnalyticsMatrix({
  report,
  loading,
  errorMsg,
  onRetry,
  onApplyRecommendation,
}: AnalyticsMatrixProps) {
  if (loading) {
    return (
      <StatePanel
        status="loading"
        title="Memuat Sunday Evaluation Matrix..."
      />
    );
  }

  if (errorMsg) {
    return (
      <StatePanel
        status="error"
        title="Gagal memuat laporan evaluasi mingguan"
        description={errorMsg}
        onRetry={onRetry}
      />
    );
  }

  if (!report || report.items.length === 0) {
    return (
      <StatePanel
        status="empty"
        title="Belum ada metrik mingguan"
        description="Laporan agregasi akan muncul setiap hari Minggu pukul 20:00 WIB."
      />
    );
  }

  return (
    <Card>
      <CardHeader
        title="Sunday Evaluation Matrix (3-Tier Product Lifecycle)"
        subtitle={`Periode mulai ${new Date(report.weekStartDate).toLocaleDateString('id-ID')}`}
      />
      <div className="space-y-4">
        {report.items.map((item) => (
          <div
            key={item.productId}
            className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-800 bg-slate-950/60 p-4"
          >
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-white">
                  {item.productName}
                </h3>
                <Badge tone={RECOMMENDATION_TONE[item.recommendation]}>
                  {item.recommendation}
                </Badge>
              </div>
              <p className="text-xs text-slate-300">
                Keyword:{' '}
                <span className="font-mono text-emerald-300">
                  {item.triggerKeyword}
                </span>{' '}
                • Views: {item.totalViews.toLocaleString('id-ID')} • Komen:{' '}
                {item.totalTriggerComments} • DM: {item.totalDmSent} • Klik:{' '}
                {item.estimatedClicks} • Komisi: Rp
                {item.estimatedCommissionIdr.toLocaleString('id-ID')}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={item.recommendation === 'SCALE' ? 'primary' : 'secondary'}
                onClick={() => void onApplyRecommendation(item.productId, 'SCALE')}
              >
                Scale
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  void onApplyRecommendation(item.productId, 'OPTIMIZE_HOOK')
                }
              >
                Optimize Hook
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() => void onApplyRecommendation(item.productId, 'DROP')}
              >
                Drop Produk
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
