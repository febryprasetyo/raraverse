import type { PublishJobPayload, PublishJobRecord } from '@ebieshop/shared';
import type { IPublishJobRepository } from './contracts.js';

export interface PublishResult {
  platformPostId: string;
  platformPostUrl?: string;
}

export interface IPlatformPublisher {
  publish(payload: PublishJobPayload): Promise<PublishResult>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class IgReelsPublisher implements IPlatformPublisher {
  private readonly igUserId: string;
  private readonly accessToken: string;
  private readonly publicBaseUrl: string;
  private readonly graphBaseUrl: string;
  private readonly pollIntervalMs: number;
  private readonly maxPollAttempts: number;
  private readonly fetchFn: typeof fetch;

  constructor(options: {
    igUserId: string;
    accessToken: string;
    publicBaseUrl: string;
    graphBaseUrl?: string;
    pollIntervalMs?: number;
    maxPollAttempts?: number;
    fetchFn?: typeof fetch;
  }) {
    this.igUserId = options.igUserId;
    this.accessToken = options.accessToken;
    this.publicBaseUrl = options.publicBaseUrl.replace(/\/$/, '');
    this.graphBaseUrl = (
      options.graphBaseUrl ?? 'https://graph.facebook.com/v21.0'
    ).replace(/\/$/, '');
    this.pollIntervalMs = options.pollIntervalMs ?? 5000;
    this.maxPollAttempts = options.maxPollAttempts ?? 36;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async publish(payload: PublishJobPayload): Promise<PublishResult> {
    const videoUrl = `${this.publicBaseUrl}/${payload.videoR2Key.replace(/^\/+/, '')}`;
    const createRes = await this.fetchFn(
      `${this.graphBaseUrl}/${encodeURIComponent(this.igUserId)}/media`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.accessToken}`,
        },
        body: JSON.stringify({
          media_type: 'REELS',
          video_url: videoUrl,
          caption: payload.captionSeo,
          share_to_feed: true,
        }),
      }
    );

    if (!createRes.ok) {
      throw new Error(`IG media container error (${createRes.status})`);
    }
    const { id: creationId } = (await createRes.json()) as { id: string };

    let statusCode = 'IN_PROGRESS';
    for (let attempt = 0; attempt < this.maxPollAttempts; attempt += 1) {
      const statusRes = await this.fetchFn(
        `${this.graphBaseUrl}/${encodeURIComponent(creationId)}?fields=status_code`,
        {
          headers: { Authorization: `Bearer ${this.accessToken}` },
        }
      );
      if (!statusRes.ok) {
        throw new Error(`IG container status error (${statusRes.status})`);
      }
      const statusData = (await statusRes.json()) as { status_code?: string };
      statusCode = statusData.status_code ?? 'IN_PROGRESS';
      if (statusCode === 'FINISHED') {
        break;
      }
      if (statusCode === 'ERROR') {
        throw new Error(`IG container processing failed for '${creationId}'`);
      }
      await sleep(this.pollIntervalMs);
    }

    if (statusCode !== 'FINISHED') {
      throw new Error(`IG container '${creationId}' timed out before FINISHED`);
    }

    const publishRes = await this.fetchFn(
      `${this.graphBaseUrl}/${encodeURIComponent(this.igUserId)}/media_publish`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.accessToken}`,
        },
        body: JSON.stringify({ creation_id: creationId }),
      }
    );

    if (!publishRes.ok) {
      throw new Error(`IG media_publish error (${publishRes.status})`);
    }
    const { id: mediaId } = (await publishRes.json()) as { id: string };

    if (payload.pinnedComment) {
      await this.fetchFn(
        `${this.graphBaseUrl}/${encodeURIComponent(mediaId)}/comments`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.accessToken}`,
          },
          body: JSON.stringify({ message: payload.pinnedComment }),
        }
      );
    }

    return {
      platformPostId: mediaId,
      platformPostUrl: `https://www.instagram.com/reel/${mediaId}/`,
    };
  }
}

export class FbReelsPublisher implements IPlatformPublisher {
  private readonly pageId: string;
  private readonly pageAccessToken: string;
  private readonly publicBaseUrl: string;
  private readonly graphBaseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: {
    pageId: string;
    pageAccessToken: string;
    publicBaseUrl: string;
    graphBaseUrl?: string;
    fetchFn?: typeof fetch;
  }) {
    this.pageId = options.pageId;
    this.pageAccessToken = options.pageAccessToken;
    this.publicBaseUrl = options.publicBaseUrl.replace(/\/$/, '');
    this.graphBaseUrl = (
      options.graphBaseUrl ?? 'https://graph.facebook.com/v21.0'
    ).replace(/\/$/, '');
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async publish(payload: PublishJobPayload): Promise<PublishResult> {
    const fileUrl = `${this.publicBaseUrl}/${payload.videoR2Key.replace(/^\/+/, '')}`;
    const startRes = await this.fetchFn(
      `${this.graphBaseUrl}/${encodeURIComponent(this.pageId)}/video_reels`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.pageAccessToken}`,
        },
        body: JSON.stringify({ upload_phase: 'start' }),
      }
    );
    if (!startRes.ok) {
      throw new Error(`FB Reels start error (${startRes.status})`);
    }
    const { video_id: videoId, upload_url: uploadUrl } = (await startRes.json()) as {
      video_id: string;
      upload_url: string;
    };

    const uploadRes = await this.fetchFn(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: `OAuth ${this.pageAccessToken}`,
        file_url: fileUrl,
      },
    });
    if (!uploadRes.ok) {
      throw new Error(`FB Reels upload error (${uploadRes.status})`);
    }

    const finishRes = await this.fetchFn(
      `${this.graphBaseUrl}/${encodeURIComponent(this.pageId)}/video_reels`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.pageAccessToken}`,
        },
        body: JSON.stringify({
          upload_phase: 'finish',
          video_id: videoId,
          video_state: 'PUBLISHED',
          description: payload.captionSeo,
        }),
      }
    );
    if (!finishRes.ok) {
      throw new Error(`FB Reels finish error (${finishRes.status})`);
    }

    return {
      platformPostId: videoId,
      platformPostUrl: `https://www.facebook.com/reel/${videoId}`,
    };
  }
}

export class YtShortsPublisher implements IPlatformPublisher {
  private readonly accessToken: string;
  private readonly publicBaseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: {
    accessToken: string;
    publicBaseUrl: string;
    fetchFn?: typeof fetch;
  }) {
    this.accessToken = options.accessToken;
    this.publicBaseUrl = options.publicBaseUrl.replace(/\/$/, '');
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async publish(payload: PublishJobPayload): Promise<PublishResult> {
    const videoUrl = `${this.publicBaseUrl}/${payload.videoR2Key.replace(/^\/+/, '')}`;
    const videoRes = await this.fetchFn(videoUrl);
    if (!videoRes.ok) {
      throw new Error(`Failed to fetch rendered video from R2 (${videoRes.status})`);
    }
    const videoBytes = await videoRes.arrayBuffer();

    const title = `${payload.productName.slice(0, 80)} #Shorts`;
    const metadata = {
      snippet: {
        title,
        description: `${payload.captionSeo}\n\n${payload.pinnedComment}\n#Shorts`,
        categoryId: '22',
      },
      status: {
        privacyStatus: payload.visibility === 'PRIVATE' ? 'private' : 'public',
        selfDeclaredMadeForKids: false,
      },
    };

    const boundary = `ebieshop_${Date.now()}`;
    const bodyParts = [
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
      `--${boundary}\r\nContent-Type: video/mp4\r\n\r\n`,
    ];
    const prefix = Buffer.from(bodyParts.join(''), 'utf8');
    const suffix = Buffer.from(`\r\n--${boundary}--`, 'utf8');
    const multipart = Buffer.concat([prefix, Buffer.from(videoBytes), suffix]);

    const uploadRes = await this.fetchFn(
      'https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status&uploadType=multipart',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: multipart,
      }
    );

    if (!uploadRes.ok) {
      throw new Error(`YouTube upload error (${uploadRes.status})`);
    }
    const { id: videoId } = (await uploadRes.json()) as { id: string };

    return {
      platformPostId: videoId,
      platformPostUrl: `https://www.youtube.com/shorts/${videoId}`,
    };
  }
}

export class OfficialApiPublishProcessor {
  constructor(
    private readonly publishJobs: IPublishJobRepository,
    private readonly publishers: Partial<Record<string, IPlatformPublisher>>
  ) {}

  async process(payload: PublishJobPayload): Promise<PublishJobRecord> {
    const publisher = this.publishers[payload.platform];
    if (!publisher) {
      throw new Error(`No official publisher registered for '${payload.platform}'`);
    }

    const existing = await this.publishJobs.getPublishJobById(payload.publishJobId);
    const nextAttempt = (existing?.attemptCount ?? 0) + 1;

    await this.publishJobs.updatePublishJob(payload.publishJobId, {
      status: 'PROCESSING',
      attemptCount: nextAttempt,
    });

    try {
      const result = await publisher.publish(payload);
      return await this.publishJobs.updatePublishJob(payload.publishJobId, {
        status: 'PUBLISHED',
        publishedAt: new Date().toISOString(),
        platformPostId: result.platformPostId,
        lastError: null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown publish error';
      await this.publishJobs.updatePublishJob(payload.publishJobId, {
        status: 'FAILED',
        lastError: message,
      });
      throw err;
    }
  }
}
