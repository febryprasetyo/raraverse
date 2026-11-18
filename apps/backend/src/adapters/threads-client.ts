import type { ThreadsMediaType } from '@ebieshop/shared';
import { AppError } from '../errors.js';

export const DEFAULT_THREADS_SCOPES = [
  'threads_basic',
  'threads_content_publish',
  'threads_manage_replies',
  'threads_read_replies',
] as const;

export interface ThreadsTokenResult {
  accessToken: string;
  tokenType: 'USER' | 'APP';
  expiresInSec: number;
  userId?: string;
}

export interface ThreadsProfileResult {
  userId: string;
  username: string;
  displayName: string;
}

export interface PublishChainedThreadInput {
  mediaType: ThreadsMediaType;
  rootText: string;
  replyText: string;
  mediaUrl?: string;
  userId?: string;
}

export interface PublishChainedThreadResult {
  rootPostId: string;
  replyPostId: string | null;
  permalink: string | null;
  username?: string;
  httpStatus: number;
  partialError?: string;
}

export interface IThreadsClient {
  getAuthorizeUrl(input: {
    redirectUri: string;
    scopes?: string[];
    state?: string;
  }): { authorizeUrl: string; state: string; redirectUri: string; scopes: string[] };
  exchangeAuthorizationCode(code: string, redirectUri: string): Promise<ThreadsTokenResult>;
  exchangeAppClientCredentials(): Promise<ThreadsTokenResult>;
  refreshLongLivedToken(accessToken: string): Promise<ThreadsTokenResult>;
  getProfile(overrideAccessToken?: string): Promise<ThreadsProfileResult>;
  publishChainedThread(
    input: PublishChainedThreadInput
  ): Promise<PublishChainedThreadResult>;
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function cleanThreadsOAuthCode(rawCode: string): string {
  return rawCode.trim().replace(/#_$/, '');
}

export class ThreadsHttpClient implements IThreadsClient {
  private userAccessToken?: string;
  private appAccessToken?: string;
  private userId?: string;
  private readonly appId?: string;
  private readonly appSecret?: string;
  private readonly displayName: string;
  private readonly graphBaseUrl: string;
  private readonly authBaseUrl: string;
  private readonly pollIntervalMs: number;
  private readonly maxPollAttempts: number;
  private readonly fetchFn: typeof fetch;
  private readonly resolveUserToken?: () => Promise<{
    accessToken: string;
    userId?: string;
  } | null>;
  private readonly onUserTokenUpdated?: (token: ThreadsTokenResult) => Promise<void>;

  constructor(options: {
    appId?: string;
    appSecret?: string;
    displayName?: string;
    userId?: string;
    userAccessToken?: string;
    graphBaseUrl?: string;
    authBaseUrl?: string;
    pollIntervalMs?: number;
    maxPollAttempts?: number;
    fetchFn?: typeof fetch;
    resolveUserToken?: () => Promise<{ accessToken: string; userId?: string } | null>;
    onUserTokenUpdated?: (token: ThreadsTokenResult) => Promise<void>;
  }) {
    this.appId = options.appId;
    this.appSecret = options.appSecret;
    this.displayName = options.displayName ?? 'raraverse';
    this.userId = options.userId;
    this.userAccessToken = options.userAccessToken;
    this.graphBaseUrl = (
      options.graphBaseUrl ?? 'https://graph.threads.net'
    ).replace(/\/+$/, '');
    this.authBaseUrl = (options.authBaseUrl ?? 'https://threads.net').replace(/\/+$/, '');
    this.pollIntervalMs = options.pollIntervalMs ?? 2000;
    this.maxPollAttempts = options.maxPollAttempts ?? 15;
    this.fetchFn = options.fetchFn ?? fetch;
    this.resolveUserToken = options.resolveUserToken;
    this.onUserTokenUpdated = options.onUserTokenUpdated;
  }

  private getAppCredentials(): { appId: string; appSecret: string } {
    const appId =
      this.appId ??
      process.env.THREADS_APP_ID?.trim() ??
      process.env.TREADS_APP_ID?.trim();
    const appSecret =
      this.appSecret ??
      process.env.THREADS_APP_SECRET?.trim() ??
      process.env.TREADS_APP_SECRET?.trim();
    if (!appId || !appSecret) {
      throw new AppError(
        400,
        'THREADS_APP_ID dan THREADS_APP_SECRET wajib dikonfigurasi di server'
      );
    }
    return { appId, appSecret };
  }

  private async getActiveUserToken(): Promise<string> {
    if (!this.userAccessToken && this.resolveUserToken) {
      const resolved = await this.resolveUserToken();
      if (resolved?.accessToken) {
        this.userAccessToken = resolved.accessToken;
        if (resolved.userId) {
          this.userId = resolved.userId;
        }
      }
    }
    if (!this.userAccessToken) {
      throw new AppError(
        401,
        'Threads User Access Token belum terhubung. Hubungkan akun Threads via OAuth terlebih dahulu.'
      );
    }
    return this.userAccessToken;
  }

  getAuthorizeUrl(input: {
    redirectUri: string;
    scopes?: string[];
    state?: string;
  }): { authorizeUrl: string; state: string; redirectUri: string; scopes: string[] } {
    const appId =
      this.appId ??
      process.env.THREADS_APP_ID?.trim() ??
      process.env.TREADS_APP_ID?.trim() ??
      '';
    if (!appId) {
      throw new AppError(400, 'THREADS_APP_ID wajib dikonfigurasi untuk membuat URL OAuth');
    }
    const scopes =
      input.scopes && input.scopes.length > 0
        ? input.scopes
        : [...DEFAULT_THREADS_SCOPES];
    const state = input.state ?? `threads_${Date.now().toString(36)}`;
    const url = new URL(`${this.authBaseUrl}/oauth/authorize`);
    url.searchParams.set('client_id', appId);
    url.searchParams.set('redirect_uri', input.redirectUri);
    url.searchParams.set('scope', scopes.join(','));
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('state', state);
    return {
      authorizeUrl: url.toString(),
      state,
      redirectUri: input.redirectUri,
      scopes,
    };
  }

  async exchangeAuthorizationCode(
    rawCode: string,
    redirectUri: string
  ): Promise<ThreadsTokenResult> {
    const { appId, appSecret } = this.getAppCredentials();
    const code = cleanThreadsOAuthCode(rawCode);
    if (!code) {
      throw new AppError(400, 'Parameter authorization code Threads wajib diisi');
    }

    const body = new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code,
    });

    const response = await this.fetchFn(`${this.graphBaseUrl}/oauth/access_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: body.toString(),
    });

    const data = (await response.json().catch(() => ({}))) as {
      access_token?: string;
      user_id?: string | number;
      error_message?: string;
      error?: { message?: string };
    };

    if (!response.ok || !data.access_token) {
      const msg =
        data.error?.message ?? data.error_message ?? `HTTP ${response.status}`;
      throw new AppError(502, `Threads OAuth code exchange gagal: ${msg}`);
    }

    let finalToken = data.access_token;
    let expiresInSec = 3600;
    const userId = data.user_id !== undefined ? String(data.user_id) : undefined;

    // Upgrade short-lived token to 60-day long-lived token
    try {
      const exchangeUrl = new URL(`${this.graphBaseUrl}/access_token`);
      exchangeUrl.searchParams.set('grant_type', 'th_exchange_token');
      exchangeUrl.searchParams.set('client_secret', appSecret);
      exchangeUrl.searchParams.set('access_token', data.access_token);
      const longRes = await this.fetchFn(exchangeUrl.toString(), { method: 'GET' });
      if (longRes.ok) {
        const longData = (await longRes.json()) as {
          access_token?: string;
          expires_in?: number;
        };
        if (longData.access_token) {
          finalToken = longData.access_token;
          expiresInSec = longData.expires_in ?? 60 * 86400;
        }
      }
    } catch {
      // Keep short-lived token if long-lived exchange is unavailable
    }

    this.userAccessToken = finalToken;
    if (userId) {
      this.userId = userId;
    }

    const result: ThreadsTokenResult = {
      accessToken: finalToken,
      tokenType: 'USER',
      expiresInSec,
      userId,
    };

    if (this.onUserTokenUpdated) {
      await this.onUserTokenUpdated(result);
    }

    return result;
  }

  async exchangeAppClientCredentials(): Promise<ThreadsTokenResult> {
    const { appId, appSecret } = this.getAppCredentials();
    const url = new URL(`${this.graphBaseUrl}/oauth/access_token`);
    url.searchParams.set('client_id', appId);
    url.searchParams.set('client_secret', appSecret);
    url.searchParams.set('grant_type', 'client_credentials');

    const response = await this.fetchFn(url.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    const data = (await response.json().catch(() => ({}))) as {
      access_token?: string;
      expires_in?: number;
      error?: { message?: string };
      error_message?: string;
    };

    if (!response.ok || !data.access_token) {
      const msg =
        data.error?.message ?? data.error_message ?? `HTTP ${response.status}`;
      throw new AppError(502, `Threads App Access Token gagal: ${msg}`);
    }

    this.appAccessToken = data.access_token;
    return {
      accessToken: data.access_token,
      tokenType: 'APP',
      expiresInSec: data.expires_in ?? 60 * 86400,
    };
  }

  async refreshLongLivedToken(accessToken: string): Promise<ThreadsTokenResult> {
    const url = new URL(`${this.graphBaseUrl}/refresh_access_token`);
    url.searchParams.set('grant_type', 'th_refresh_token');
    url.searchParams.set('access_token', accessToken);

    const response = await this.fetchFn(url.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    const data = (await response.json().catch(() => ({}))) as {
      access_token?: string;
      expires_in?: number;
      error?: { message?: string };
    };
    if (!response.ok || !data.access_token) {
      throw new AppError(
        502,
        `Threads token refresh gagal (${response.status}): ${data.error?.message ?? 'Unknown error'}`
      );
    }

    this.userAccessToken = data.access_token;
    return {
      accessToken: data.access_token,
      tokenType: 'USER',
      expiresInSec: data.expires_in ?? 60 * 86400,
    };
  }

  async getProfile(overrideAccessToken?: string): Promise<ThreadsProfileResult> {
    const token = overrideAccessToken ?? (await this.getActiveUserToken());
    const url = new URL(`${this.graphBaseUrl}/v1.0/me`);
    url.searchParams.set('fields', 'id,username,name');

    const response = await this.fetchFn(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });
    const data = (await response.json().catch(() => ({}))) as {
      id?: string;
      username?: string;
      name?: string;
      error?: { message?: string };
    };

    if (!response.ok || !data.id) {
      throw new AppError(
        response.status === 401 ? 401 : 502,
        `Threads /me error (${response.status}): ${data.error?.message ?? 'Gagal membaca profil'}`
      );
    }

    this.userId = String(data.id);
    return {
      userId: String(data.id),
      username: data.username ?? this.displayName,
      displayName: data.name ?? data.username ?? this.displayName,
    };
  }

  private async createMediaContainer(
    userId: string,
    token: string,
    params: Record<string, string>
  ): Promise<string> {
    const body = new URLSearchParams(params);
    const response = await this.fetchFn(
      `${this.graphBaseUrl}/v1.0/${encodeURIComponent(userId)}/threads`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: body.toString(),
      }
    );
    const data = (await response.json().catch(() => ({}))) as {
      id?: string;
      error?: { message?: string };
    };
    if (!response.ok || !data.id) {
      throw new AppError(
        502,
        `Threads container error (${response.status}): ${data.error?.message ?? 'Missing container id'}`
      );
    }
    return String(data.id);
  }

  private async waitForContainerReady(containerId: string, token: string): Promise<void> {
    for (let attempt = 0; attempt < this.maxPollAttempts; attempt += 1) {
      const url = new URL(`${this.graphBaseUrl}/v1.0/${encodeURIComponent(containerId)}`);
      url.searchParams.set('fields', 'status,error_message');
      const res = await this.fetchFn(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        return;
      }
      const data = (await res.json().catch(() => ({}))) as {
        status?: string;
        error_message?: string;
      };
      if (data.status === 'FINISHED' || data.status === 'PUBLISHED') {
        return;
      }
      if (data.status === 'ERROR' || data.status === 'EXPIRED') {
        throw new AppError(
          502,
          `Threads container gagal diproses: ${data.error_message ?? data.status}`
        );
      }
      await sleep(this.pollIntervalMs);
    }
  }

  private async publishContainer(
    userId: string,
    token: string,
    creationId: string
  ): Promise<string> {
    const body = new URLSearchParams({ creation_id: creationId });
    const response = await this.fetchFn(
      `${this.graphBaseUrl}/v1.0/${encodeURIComponent(userId)}/threads_publish`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: body.toString(),
      }
    );
    const data = (await response.json().catch(() => ({}))) as {
      id?: string;
      error?: { message?: string };
    };
    if (!response.ok || !data.id) {
      throw new AppError(
        502,
        `Threads publish error (${response.status}): ${data.error?.message ?? 'Missing post id'}`
      );
    }
    return String(data.id);
  }

  private async fetchPermalink(postId: string, token: string): Promise<string | null> {
    try {
      const url = new URL(`${this.graphBaseUrl}/v1.0/${encodeURIComponent(postId)}`);
      url.searchParams.set('fields', 'id,permalink');
      const res = await this.fetchFn(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { permalink?: string };
      return data.permalink ?? null;
    } catch {
      return null;
    }
  }

  async publishChainedThread(
    input: PublishChainedThreadInput
  ): Promise<PublishChainedThreadResult> {
    const token = await this.getActiveUserToken();
    let userId = input.userId ?? this.userId;
    let username = this.displayName;

    if (!userId) {
      const profile = await this.getProfile(token);
      userId = profile.userId;
      username = profile.username;
    }

    const rootParams: Record<string, string> = {
      media_type: input.mediaType,
      text: input.rootText,
    };
    if (input.mediaType === 'IMAGE' && input.mediaUrl) {
      rootParams.image_url = input.mediaUrl;
    } else if (input.mediaType === 'VIDEO' && input.mediaUrl) {
      rootParams.video_url = input.mediaUrl;
    }

    const rootContainerId = await this.createMediaContainer(userId, token, rootParams);
    if (input.mediaType !== 'TEXT') {
      await this.waitForContainerReady(rootContainerId, token);
    }

    const rootPostId = await this.publishContainer(userId, token, rootContainerId);
    const permalink = await this.fetchPermalink(rootPostId, token);

    try {
      const replyContainerId = await this.createMediaContainer(userId, token, {
        media_type: 'TEXT',
        text: input.replyText,
        reply_to_id: rootPostId,
      });
      const replyPostId = await this.publishContainer(userId, token, replyContainerId);
      return {
        rootPostId,
        replyPostId,
        permalink,
        username,
        httpStatus: 200,
      };
    } catch (err) {
      const partialError = err instanceof Error ? err.message : String(err);
      return {
        rootPostId,
        replyPostId: null,
        permalink,
        username,
        httpStatus: 207,
        partialError,
      };
    }
  }
}

export class MockThreadsClient implements IThreadsClient {
  private counter = 100;

  getAuthorizeUrl(input: {
    redirectUri: string;
    scopes?: string[];
    state?: string;
  }) {
    const scopes =
      input.scopes && input.scopes.length > 0
        ? input.scopes
        : [...DEFAULT_THREADS_SCOPES];
    const state = input.state ?? 'mock_threads_state';
    const url = new URL('https://threads.net/oauth/authorize');
    url.searchParams.set('client_id', '1811443116804615');
    url.searchParams.set('redirect_uri', input.redirectUri);
    url.searchParams.set('scope', scopes.join(','));
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('state', state);
    return {
      authorizeUrl: url.toString(),
      state,
      redirectUri: input.redirectUri,
      scopes,
    };
  }

  async exchangeAuthorizationCode(): Promise<ThreadsTokenResult> {
    return {
      accessToken: 'mock_threads_user_token',
      tokenType: 'USER',
      expiresInSec: 60 * 86400,
      userId: '25000112233',
    };
  }

  async exchangeAppClientCredentials(): Promise<ThreadsTokenResult> {
    return {
      accessToken: 'mock_threads_app_token',
      tokenType: 'APP',
      expiresInSec: 60 * 86400,
    };
  }

  async refreshLongLivedToken(): Promise<ThreadsTokenResult> {
    return {
      accessToken: 'mock_threads_refreshed_user_token',
      tokenType: 'USER',
      expiresInSec: 60 * 86400,
    };
  }

  async getProfile(): Promise<ThreadsProfileResult> {
    return {
      userId: '25000112233',
      username: 'raraverse',
      displayName: 'raraverse',
    };
  }

  async publishChainedThread(): Promise<PublishChainedThreadResult> {
    this.counter += 1;
    const rootPostId = `1799000111222${this.counter}`;
    const replyPostId = `1799000111333${this.counter}`;
    return {
      rootPostId,
      replyPostId,
      permalink: `https://www.threads.net/@raraverse/post/C_mock${this.counter}`,
      username: 'raraverse',
      httpStatus: 200,
    };
  }
}
