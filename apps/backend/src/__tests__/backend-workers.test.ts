import { describe, expect, it, vi } from 'vitest';
import { registerBackendCronJobs } from '../workers/index.js';
import type { QueueRegistry } from '../queues/registry.js';

describe('Backend BullMQ Workers & Cron Registration', () => {
  it('registers weekly OAuth refresh, Sunday evaluation, and 3 prime-time production crons', async () => {
    const addOAuth = vi.fn().mockResolvedValue(undefined);
    const addWeekly = vi.fn().mockResolvedValue(undefined);
    const addScript = vi.fn().mockResolvedValue(undefined);

    const fakeRegistry = {
      queues: {
        OAUTH_TOKEN_REFRESH: { add: addOAuth },
        WEEKLY_EVALUATION: { add: addWeekly },
        SCRIPT_GENERATION: { add: addScript },
      },
    } as unknown as QueueRegistry;

    await registerBackendCronJobs(fakeRegistry);

    expect(addOAuth).toHaveBeenCalledWith(
      'weekly-oauth-refresh',
      { withinDays: 14 },
      expect.objectContaining({ repeat: { pattern: '0 20 * * 0' } })
    );
    expect(addWeekly).toHaveBeenCalledWith(
      'sunday-evaluation',
      {},
      expect.objectContaining({ repeat: { pattern: '0 13 * * 0' } })
    );
    expect(addScript).toHaveBeenCalledTimes(3);
  });
});
