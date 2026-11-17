import { describe, expect, it } from 'vitest';
import {
  classifyProductPerformance,
  evaluateWeeklyMetrics,
} from '../services/weekly-evaluator.js';

describe('Sunday Evaluation Aggregator (3-Tier Lifecycle)', () => {
  it('classifies SCALE, OPTIMIZE_HOOK, and DROP accurately', () => {
    expect(
      classifyProductPerformance({
        videosPublished: 4,
        totalViews: 20000,
        totalTriggerComments: 120,
        totalDmSent: 115,
        estimatedClicks: 80,
        estimatedCommissionIdr: 400000,
      })
    ).toBe('SCALE');

    expect(
      classifyProductPerformance({
        videosPublished: 3,
        totalViews: 12000,
        totalTriggerComments: 5,
        totalDmSent: 5,
        estimatedClicks: 2,
        estimatedCommissionIdr: 0,
      })
    ).toBe('OPTIMIZE_HOOK');

    expect(
      classifyProductPerformance({
        videosPublished: 3,
        totalViews: 900,
        totalTriggerComments: 0,
        totalDmSent: 0,
        estimatedClicks: 0,
        estimatedCommissionIdr: 0,
      })
    ).toBe('DROP');
  });

  it('builds a WeeklyEvaluationReport validated against schema', () => {
    const report = evaluateWeeklyMetrics({
      weekStartDate: '2026-11-10T00:00:00.000Z',
      rows: [
        {
          productId: '550e8400-e29b-41d4-a716-446655440001',
          productName: 'Rak Bumbu 2 Tingkat',
          triggerKeyword: 'RAK01',
          videosPublished: 3,
          totalViews: 15000,
          totalTriggerComments: 80,
          totalDmSent: 78,
          estimatedClicks: 50,
          estimatedCommissionIdr: 250000,
        },
      ],
    });

    expect(report.items).toHaveLength(1);
    expect(report.items[0]?.recommendation).toBe('SCALE');
    expect(report.items[0]?.operatorDecision).toBe('PENDING');
  });
});
