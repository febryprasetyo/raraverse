import type { TargetPlatform } from '@ebieshop/shared';

export interface PrimeTimeSlot {
  name: 'SIANG' | 'SORE' | 'MALAM';
  produceWib: string;
  publishWib: string;
  produceCronUtc: string;
}

export const PRIME_TIME_SLOTS_WIB: ReadonlyArray<PrimeTimeSlot> = [
  { name: 'SIANG', produceWib: '09:30', publishWib: '11:30', produceCronUtc: '30 2 * * *' },
  { name: 'SORE', produceWib: '14:30', publishWib: '16:30', produceCronUtc: '30 7 * * *' },
  { name: 'MALAM', produceWib: '17:30', publishWib: '19:30', produceCronUtc: '30 10 * * *' },
];

export interface StaggeredScheduleItem {
  platform: TargetPlatform;
  scheduledAtIso: string;
}

export function buildPrimeTimePlan(input: {
  dateWib: string;
  slotIndex: 0 | 1 | 2;
  platforms: TargetPlatform[];
  randomFn?: () => number;
}): StaggeredScheduleItem[] {
  const slot = PRIME_TIME_SLOTS_WIB[input.slotIndex]!;
  const rand = input.randomFn ?? Math.random;
  const baseMs = Date.parse(`${input.dateWib}T${slot.publishWib}:00+07:00`);

  let cumulativeMinutes = 0;
  return input.platforms.map((platform, idx) => {
    if (idx > 0) {
      const gapMinutes = Math.round(10 + rand() * 15);
      cumulativeMinutes += gapMinutes;
    }
    return {
      platform,
      scheduledAtIso: new Date(baseMs + cumulativeMinutes * 60_000).toISOString(),
    };
  });
}
