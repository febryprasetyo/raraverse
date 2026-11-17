import {
  WeeklyEvaluationReportSchema,
  type WeeklyEvaluationReport,
  type WeeklyRecommendation,
} from '@ebieshop/shared';

export interface WeeklyMetricInput {
  videosPublished: number;
  totalViews: number;
  totalTriggerComments: number;
  totalDmSent: number;
  estimatedClicks: number;
  estimatedCommissionIdr: number;
}

export interface WeeklyProductMetricRow extends WeeklyMetricInput {
  productId: string;
  productName: string;
  triggerKeyword: string;
}

export function classifyProductPerformance(
  metric: WeeklyMetricInput
): WeeklyRecommendation {
  const avgViews =
    metric.videosPublished > 0 ? metric.totalViews / metric.videosPublished : 0;
  const commentRate =
    metric.totalViews > 0 ? metric.totalTriggerComments / metric.totalViews : 0;

  if (
    metric.videosPublished >= 3 &&
    avgViews < 500 &&
    metric.estimatedClicks === 0 &&
    metric.estimatedCommissionIdr === 0
  ) {
    return 'DROP';
  }

  if (
    metric.estimatedCommissionIdr > 0 &&
    commentRate >= 0.003 &&
    metric.estimatedClicks >= 10
  ) {
    return 'SCALE';
  }

  return 'OPTIMIZE_HOOK';
}

export function evaluateWeeklyMetrics(input: {
  weekStartDate: string;
  rows: WeeklyProductMetricRow[];
}): WeeklyEvaluationReport {
  return WeeklyEvaluationReportSchema.parse({
    weekStartDate: input.weekStartDate,
    generatedAt: new Date().toISOString(),
    items: input.rows.map((row) => ({
      ...row,
      recommendation: classifyProductPerformance(row),
      operatorDecision: 'PENDING',
    })),
  });
}
