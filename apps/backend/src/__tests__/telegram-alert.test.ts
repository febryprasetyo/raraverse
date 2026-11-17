import { describe, expect, it, vi } from 'vitest';
import {
  formatTelegramAlertMessage,
  TelegramAlertService,
} from '../services/telegram-alert.js';

describe('TelegramAlertService', () => {
  it('formats [CRITICAL], [ERROR], [WARNING], and [INFO] alerts clearly', () => {
    const critical = formatTelegramAlertMessage({
      severity: 'CRITICAL',
      title: 'Session Expired',
      body: 'storageState.shopee.json kedaluwarsa, silakan login ulang.',
    });
    expect(critical).toContain('[CRITICAL] Session Expired');

    const error = formatTelegramAlertMessage({
      severity: 'ERROR',
      title: 'Job Gagal Permanen',
      body: 'local-video-render #42 gagal setelah 3x retry.',
    });
    expect(error).toContain('[ERROR] Job Gagal Permanen');

    const warning = formatTelegramAlertMessage({
      severity: 'WARNING',
      title: 'Worker Offline',
      body: 'Node lokal offline > 15 menit.',
    });
    expect(warning).toContain('[WARNING] Worker Offline');

    const info = formatTelegramAlertMessage({
      severity: 'INFO',
      title: 'Ringkasan Harian (22:00 WIB)',
      body: '3 video ter-render, 3 publish sukses, 18 Auto-DM terkirim.',
    });
    expect(info).toContain('[INFO] Ringkasan Harian (22:00 WIB)');
  });

  it('sends alert to Telegram Bot API and deduplicates repeated alerts within cooldown window', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });

    let fakeNow = 1_700_000_000_000;
    const service = new TelegramAlertService({
      botToken: '123456:ABCDEF',
      chatId: '-100999888',
      cooldownMs: 15 * 60_000,
      nowFn: () => fakeNow,
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    const first = await service.notifyWorkerOffline('local-win-01', 18);
    expect(first).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.telegram.org/bot123456:ABCDEF/sendMessage');
    expect(String(init.body)).toContain('[WARNING] Worker Offline');

    // Repeated alert within 15-minute cooldown must be deduplicated
    fakeNow += 5 * 60_000;
    const duplicate = await service.notifyWorkerOffline('local-win-01', 23);
    expect(duplicate).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // After cooldown expires, alert sends again
    fakeNow += 11 * 60_000;
    const afterCooldown = await service.notifyWorkerOffline('local-win-01', 34);
    expect(afterCooldown).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('provides helper methods for session expired, job failed, rate limit, and daily summary', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });

    const service = new TelegramAlertService({
      botToken: '123:XYZ',
      chatId: '456',
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    await service.notifySessionExpired('SHOPEE_VIDEO');
    await service.notifyJobFailed('official-api-publish', 'job-9', 'HTTP 500');
    await service.notifyRateLimit('meta', 429);
    await service.notifyDailySummary({
      videosRendered: 3,
      publishSucceeded: 5,
      publishFailed: 0,
      autoDmSent: 24,
    });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(String(fetchMock.mock.calls[0]?.[1]?.body)).toContain('[CRITICAL]');
    expect(String(fetchMock.mock.calls[1]?.[1]?.body)).toContain('[ERROR]');
    expect(String(fetchMock.mock.calls[2]?.[1]?.body)).toContain('[WARNING]');
    expect(String(fetchMock.mock.calls[3]?.[1]?.body)).toContain('[INFO]');
  });
});
