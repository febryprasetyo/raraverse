export type AlertSeverity = 'CRITICAL' | 'ERROR' | 'WARNING' | 'INFO';

export interface TelegramAlertPayload {
  severity: AlertSeverity;
  title: string;
  body: string;
  dedupKey?: string;
}

export interface DailySummaryStats {
  videosRendered: number;
  publishSucceeded: number;
  publishFailed: number;
  autoDmSent: number;
}

export function formatTelegramAlertMessage(payload: TelegramAlertPayload): string {
  return `[${payload.severity}] ${payload.title}\n${payload.body}`;
}

export class TelegramAlertService {
  private readonly botToken?: string;
  private readonly chatId?: string;
  private readonly cooldownMs: number;
  private readonly nowFn: () => number;
  private readonly fetchFn: typeof fetch;
  private readonly sentAtByKey = new Map<string, number>();

  constructor(options?: {
    botToken?: string;
    chatId?: string;
    cooldownMs?: number;
    nowFn?: () => number;
    fetchFn?: typeof fetch;
  }) {
    this.botToken = options?.botToken;
    this.chatId = options?.chatId;
    this.cooldownMs = options?.cooldownMs ?? 15 * 60_000;
    this.nowFn = options?.nowFn ?? (() => Date.now());
    this.fetchFn = options?.fetchFn ?? fetch;
  }

  async sendAlert(payload: TelegramAlertPayload): Promise<boolean> {
    const key = payload.dedupKey ?? `${payload.severity}:${payload.title}`;
    const now = this.nowFn();
    const lastSentAt = this.sentAtByKey.get(key);
    if (lastSentAt !== undefined && now - lastSentAt < this.cooldownMs) {
      return false;
    }

    this.sentAtByKey.set(key, now);

    if (!this.botToken || !this.chatId) {
      return true;
    }

    const text = formatTelegramAlertMessage(payload);
    const res = await this.fetchFn(
      `https://api.telegram.org/bot${this.botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.chatId,
          text,
        }),
      }
    );

    if (!res.ok) {
      throw new Error(`Telegram sendMessage failed (${res.status})`);
    }
    return true;
  }

  async notifySessionExpired(platform: string): Promise<boolean> {
    return this.sendAlert({
      severity: 'CRITICAL',
      title: 'Session Expired',
      body: `storageState untuk ${platform} kedaluwarsa atau terkena verifikasi. Jalankan login ulang via skrip lokal.`,
      dedupKey: `session-expired:${platform}`,
    });
  }

  async notifyJobFailed(
    queueName: string,
    jobId: string,
    errorSummary: string
  ): Promise<boolean> {
    return this.sendAlert({
      severity: 'ERROR',
      title: 'Job Gagal Permanen',
      body: `Queue ${queueName} (job ${jobId}) gagal setelah retry: ${errorSummary}`,
      dedupKey: `job-failed:${queueName}:${jobId}`,
    });
  }

  async notifyRateLimit(provider: string, statusCode: number): Promise<boolean> {
    return this.sendAlert({
      severity: 'WARNING',
      title: 'Rate Limit / Kuota Menipis',
      body: `Terdeteksi HTTP ${statusCode} dari provider ${provider}.`,
      dedupKey: `rate-limit:${provider}:${statusCode}`,
    });
  }

  async notifyWorkerOffline(workerId: string, minutesOffline: number): Promise<boolean> {
    return this.sendAlert({
      severity: 'WARNING',
      title: 'Worker Offline',
      body: `Node lokal '${workerId}' tidak mengirim heartbeat selama ${minutesOffline} menit.`,
      dedupKey: `worker-offline:${workerId}`,
    });
  }

  async notifyDailySummary(stats: DailySummaryStats): Promise<boolean> {
    return this.sendAlert({
      severity: 'INFO',
      title: 'Ringkasan Harian (22:00 WIB)',
      body: `Video ter-render: ${stats.videosRendered} | Publish sukses: ${stats.publishSucceeded} | Gagal: ${stats.publishFailed} | Auto-DM terkirim: ${stats.autoDmSent}`,
      dedupKey: `daily-summary:${new Date(this.nowFn()).toISOString().slice(0, 10)}`,
    });
  }
}
