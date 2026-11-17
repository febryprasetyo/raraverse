import { describe, expect, it } from 'vitest';
import {
  buildPrimeTimePlan,
  PRIME_TIME_SLOTS_WIB,
} from '../services/prime-time-scheduler.js';

describe('Prime Time Scheduler (WIB) & Cross-Platform Stagger', () => {
  it('defines 3 prime time slots (11:30, 16:30, 19:30 WIB) with production 2 hours prior', () => {
    expect(PRIME_TIME_SLOTS_WIB).toHaveLength(3);
    expect(PRIME_TIME_SLOTS_WIB.map((s) => s.publishWib)).toEqual([
      '11:30',
      '16:30',
      '19:30',
    ]);
    expect(PRIME_TIME_SLOTS_WIB.map((s) => s.produceWib)).toEqual([
      '09:30',
      '14:30',
      '17:30',
    ]);
  });

  it('staggers cross-platform publish timestamps by 10 to 25 minutes per platform', () => {
    const plan = buildPrimeTimePlan({
      dateWib: '2026-11-17',
      slotIndex: 0,
      platforms: ['IG_REELS', 'FB_REELS', 'YT_SHORTS', 'SHOPEE_VIDEO'],
      randomFn: () => 0.5, // deterministic midpoint -> 17.5 -> 18 min
    });

    expect(plan).toHaveLength(4);
    for (let i = 1; i < plan.length; i += 1) {
      const prevMs = Date.parse(plan[i - 1]!.scheduledAtIso);
      const currMs = Date.parse(plan[i]!.scheduledAtIso);
      const diffMinutes = (currMs - prevMs) / 60_000;
      expect(diffMinutes).toBeGreaterThanOrEqual(10);
      expect(diffMinutes).toBeLessThanOrEqual(25);
    }
  });
});
