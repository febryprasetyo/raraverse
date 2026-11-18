import type { LnkBioAccountProfile, LnkBioGroup } from '@ebieshop/shared';
import { AppError } from '../errors.js';

export interface LnkBioPublishInput {
  title: string;
  url: string;
  fallbackDirectUrl?: string;
  imageUrl?: string;
  groupId?: string;
  scheduleFrom?: string;
  scheduleTo?: string;
  position?: number;
}

export interface LnkBioEditInput extends LnkBioPublishInput {
  lnkBioId: string;
}

export interface LnkBioPublishResult {
  lnkBioId: string;
  url?: string;
  groupDroppedFallback?: boolean;
  httpStatus?: number;
  rawResponse?: Record<string, unknown>;
}

export interface LnkBioRemoteLink {
  lnkBioId: string;
  title: string;
  link: string;
  imageUrl?: string;
  groupId?: string;
  position: number;
  clicks: number;
  scheduleFrom?: string;
  scheduleTo?: string;
}

export interface LnkBioTokenResult {
  accessToken: string;
  refreshToken?: string;
  expiresInSec: number;
  tokenType?: string;
}

export interface ILnkBioClient {
  exchangeClientCredentials(): Promise<LnkBioTokenResult>;
  exchangeAuthorizationCode(code: string, redirectUri: string): Promise<LnkBioTokenResult>;
  refreshAccessToken(refreshToken: string): Promise<LnkBioTokenResult>;
  getProfile(): Promise<LnkBioAccountProfile>;
  listGroups(): Promise<LnkBioGroup[]>;
  listLinks(): Promise<LnkBioRemoteLink[]>;
  publishLink(input: LnkBioPublishInput): Promise<LnkBioPublishResult>;
  editLink(input: LnkBioEditInput): Promise<LnkBioPublishResult>;
  deleteLink(lnkBioId: string): Promise<{ deleted: boolean; httpStatus?: number }>;
  reorderLinks(
    orderedLnkBioIds: string[],
    groupId?: string
  ): Promise<{ reordered: boolean; httpStatus?: number }>;
}

interface LnkBioApiEnvelope<T = Record<string, unknown>> {
  success?: boolean;
  status?: boolean;
  message?: string;
  error?: string;
  errors?: string[];
  info?: T | Record<string, unknown> | unknown[];
  data?: T;
  id?: string | number;
  lnk_id?: string | number;
}

interface LnkBioOAuthTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  error?: string;
  error_description?: string;
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAuthRejection(status: number, message: string): boolean {
  if (status === 401) return true;
  if (status === 400 && /not\s+authenticated|invalid\s+token|unauthorized/i.test(message)) {
    return true;
  }
  return false;
}

function isMiniPlanGroupRejection(status: number, message: string): boolean {
  if (status !== 400 && status !== 403 && status !== 502) return false;
  return /mini|plan|upgrade|group_id/i.test(message);
}

function parsePlanTier(rawPlan: unknown): LnkBioAccountProfile['planTier'] {
  const normalized = String(rawPlan ?? '').trim().toUpperCase();
  if (normalized.includes('UNIQUE')) return 'UNIQUE';
  if (normalized.includes('PRO')) return 'PRO';
  if (normalized.includes('MINI')) return 'MINI';
  if (normalized.includes('FREE')) return 'FREE';
  return 'UNKNOWN';
}

export class LnkBioHttpClient implements ILnkBioClient {
  private accessToken?: string;
  private refreshToken?: string;
  private readonly clientId?: string;
  private readonly clientSecret?: string;
  private readonly fetchFn: typeof fetch;
  private readonly baseUrl: string;
  private readonly retryDelayMs: number;
  private readonly maxRetries: number;
  private readonly resolveToken?: () => Promise<{ accessToken: string; refreshToken?: string } | null>;
  private readonly onTokenRefreshed?: (token: LnkBioTokenResult) => Promise<void>;

  constructor(options: {
    accessToken?: string;
    refreshToken?: string;
    clientId?: string;
    clientSecret?: string;
    fetchFn?: typeof fetch;
    baseUrl?: string;
    retryDelayMs?: number;
    maxRetries?: number;
    resolveToken?: () => Promise<{ accessToken: string; refreshToken?: string } | null>;
    onTokenRefreshed?: (token: LnkBioTokenResult) => Promise<void>;
  }) {
    if (!options.accessToken && !(options.clientId && options.clientSecret) && !options.resolveToken) {
      throw new Error(
        'LNKBIO_ACCESS_TOKEN or LNKBIO_CLIENT_ID + LNKBIO_CLIENT_SECRET is required for LnkBioHttpClient'
      );
    }
    this.accessToken = options.accessToken;
    this.refreshToken = options.refreshToken;
    this.clientId = options.clientId;
    this.clientSecret = options.clientSecret;
    this.fetchFn = options.fetchFn ?? fetch;
    this.baseUrl = (options.baseUrl ?? 'https://lnk.bio').replace(/\/+$/, '');
    this.retryDelayMs = options.retryDelayMs ?? 1000;
    this.maxRetries = options.maxRetries ?? 3;
    this.resolveToken = options.resolveToken;
    this.onTokenRefreshed = options.onTokenRefreshed;
  }

  private getClientCredentials(): { clientId?: string; clientSecret?: string } {
    return {
      clientId: this.clientId ?? process.env.LNKBIO_CLIENT_ID?.trim() ?? process.env.LNK_BIO_CLIENT_ID?.trim(),
      clientSecret:
        this.clientSecret ??
        process.env.LNKBIO_CLIENT_SECRET?.trim() ??
        process.env.LNK_BIO_CLIENT_SECRET?.trim(),
    };
  }

  private async getActiveAccessToken(): Promise<string> {
    if (!this.accessToken && this.resolveToken) {
      const resolved = await this.resolveToken();
      if (resolved?.accessToken) {
        this.accessToken = resolved.accessToken;
        if (resolved.refreshToken) {
          this.refreshToken = resolved.refreshToken;
        }
      }
    }

    const creds = this.getClientCredentials();
    if (!this.accessToken && creds.clientId && creds.clientSecret) {
      await this.exchangeClientCredentials();
    }

    if (!this.accessToken) {
      throw new AppError(401, 'Lnk.Bio OAuth access token is not configured');
    }
    return this.accessToken;
  }

  private async requestOAuthToken(params: URLSearchParams): Promise<LnkBioTokenResult> {
    const { clientId, clientSecret } = this.getClientCredentials();
    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    };
    if (clientId && clientSecret) {
      const encoded = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
      headers.Authorization = `Basic ${encoded}`;
    }

    let response: Response;
    try {
      response = await this.fetchFn(`${this.baseUrl}/oauth/token`, {
        method: 'POST',
        headers,
        body: params.toString(),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new AppError(502, `Lnk.Bio OAuth token request failed: ${reason}`);
    }

    const rawText = await response.text().catch(() => '');
    let data: LnkBioOAuthTokenResponse = {};
    if (rawText) {
      try {
        data = JSON.parse(rawText) as LnkBioOAuthTokenResponse;
      } catch {
        data = {};
      }
    }

    if (!response.ok || !data.access_token) {
      const errMsg = data.error_description ?? data.error ?? rawText;
      throw new AppError(
        502,
        `Lnk.Bio OAuth error (${response.status}): ${errMsg || 'Missing access_token'}`
      );
    }

    const result: LnkBioTokenResult = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? this.refreshToken,
      expiresInSec: data.expires_in ?? 86400 * 30,
      tokenType: data.token_type ?? 'Bearer',
    };

    this.accessToken = result.accessToken;
    if (result.refreshToken) {
      this.refreshToken = result.refreshToken;
    }
    if (this.onTokenRefreshed) {
      await this.onTokenRefreshed(result);
    }
    return result;
  }

  async exchangeClientCredentials(): Promise<LnkBioTokenResult> {
    const { clientId, clientSecret } = this.getClientCredentials();
    if (!clientId || !clientSecret) {
      throw new AppError(
        400,
        'LNKBIO_CLIENT_ID dan LNKBIO_CLIENT_SECRET diperlukan untuk client_credentials'
      );
    }
    return this.requestOAuthToken(
      new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      })
    );
  }

  async exchangeAuthorizationCode(
    code: string,
    redirectUri: string
  ): Promise<LnkBioTokenResult> {
    const { clientId, clientSecret } = this.getClientCredentials();
    if (!clientId || !clientSecret) {
      throw new AppError(
        400,
        'LNKBIO_CLIENT_ID dan LNKBIO_CLIENT_SECRET diperlukan untuk authorization_code'
      );
    }
    return this.requestOAuthToken(
      new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      })
    );
  }

  async refreshAccessToken(refreshToken: string): Promise<LnkBioTokenResult> {
    const { clientId, clientSecret } = this.getClientCredentials();
    if (!clientId || !clientSecret) {
      throw new AppError(
        400,
        'LNKBIO_CLIENT_ID dan LNKBIO_CLIENT_SECRET diperlukan untuk refresh_token'
      );
    }
    return this.requestOAuthToken(
      new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
      })
    );
  }

  private async tryAutoRefresh(): Promise<boolean> {
    const { clientId, clientSecret } = this.getClientCredentials();
    try {
      if (this.refreshToken && clientId && clientSecret) {
        await this.refreshAccessToken(this.refreshToken);
        return true;
      }
      if (clientId && clientSecret) {
        await this.exchangeClientCredentials();
        return true;
      }
    } catch {
      return false;
    }
    return false;
  }

  private async requestApi<T>(
    path: string,
    options: {
      method: 'GET' | 'POST';
      bodyParams?: URLSearchParams;
    }
  ): Promise<{ envelope: LnkBioApiEnvelope<T>; httpStatus: number }> {
    let refreshedOnce = false;

    for (let attempt = 1; attempt <= this.maxRetries; attempt += 1) {
      const token = await this.getActiveAccessToken();
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      };
      if (options.method === 'POST') {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
      }

      let response: Response;
      try {
        response = await this.fetchFn(`${this.baseUrl}/oauth/v1${path}`, {
          method: options.method,
          headers,
          ...(options.method === 'POST' && options.bodyParams
            ? { body: options.bodyParams.toString() }
            : {}),
        });
      } catch (error) {
        if (attempt < this.maxRetries) {
          await sleep(this.retryDelayMs * 2 ** (attempt - 1));
          continue;
        }
        const reason = error instanceof Error ? error.message : String(error);
        throw new AppError(502, `Lnk.Bio API request failed: ${reason}`);
      }

      const rawText = await response.text().catch(() => '');
      let envelope: LnkBioApiEnvelope<T> = {};
      if (rawText) {
        try {
          envelope = JSON.parse(rawText) as LnkBioApiEnvelope<T>;
        } catch {
          envelope = {};
        }
      }

      const rawMessage =
        (Array.isArray(envelope.errors) && envelope.errors.length > 0
          ? envelope.errors.join('; ')
          : undefined) ??
        envelope.message ??
        envelope.error ??
        rawText;
      const apiMessage = /<!doctype\s+html|<html/i.test(rawMessage)
        ? 'Request ditolak oleh proteksi WAF Lnk.Bio (pastikan tautan sudah dipublikasikan ke akun Lnk.Bio live dengan ID numerik valid)'
        : rawMessage;

      if (isAuthRejection(response.status, apiMessage) && !refreshedOnce) {
        refreshedOnce = true;
        const refreshed = await this.tryAutoRefresh();
        if (refreshed) {
          attempt -= 1;
          continue;
        }
      }

      if ((response.status === 429 || response.status >= 500) && attempt < this.maxRetries) {
        await sleep(this.retryDelayMs * 2 ** (attempt - 1));
        continue;
      }

      if (!response.ok) {
        throw new AppError(
          response.status >= 400 && response.status < 500 ? response.status : 502,
          `Lnk.Bio API error (${response.status} ${response.statusText}): ${apiMessage}`
        );
      }

      if (envelope.success === false || envelope.status === false) {
        throw new AppError(
          502,
          `Lnk.Bio API rejected request: ${apiMessage || 'Unknown error'}`
        );
      }

      return { envelope, httpStatus: response.status };
    }

    throw new AppError(502, 'Lnk.Bio API request exhausted retries');
  }

  private buildLinkBodyParams(
    input: LnkBioPublishInput,
    options?: { includeGroupId?: boolean; lnkBioId?: string }
  ): URLSearchParams {
    const body = new URLSearchParams();
    if (options?.lnkBioId) {
      body.set('link_id', options.lnkBioId);
      body.set('lnk_id', options.lnkBioId);
    }
    body.set('title', input.title);
    body.set('link', input.url);
    body.set('url', input.url);
    if (input.imageUrl) {
      body.set('image', input.imageUrl);
    }
    if (input.groupId && options?.includeGroupId !== false) {
      body.set('group_id', input.groupId);
    }
    if (input.scheduleFrom) {
      body.set('schedule_from', input.scheduleFrom);
    }
    if (input.scheduleTo) {
      body.set('schedule_to', input.scheduleTo);
    }
    if (input.position !== undefined) {
      body.set('position', String(input.position));
    }
    return body;
  }

  async getProfile(): Promise<LnkBioAccountProfile> {
    const { envelope } = await this.requestApi<Record<string, unknown>>('/me', {
      method: 'GET',
    });
    const rawInfo =
      envelope.data ??
      (envelope.info && !Array.isArray(envelope.info) ? envelope.info : undefined) ??
      {};
    const record = rawInfo as Record<string, unknown>;
    let planTier = parsePlanTier(record.plan ?? record.tier ?? record.plan_name);
    let supportsGroups =
      typeof record.supports_groups === 'boolean'
        ? record.supports_groups
        : planTier === 'MINI' || planTier === 'PRO' || planTier === 'UNIQUE';

    if (planTier === 'UNKNOWN' && typeof record.supports_groups !== 'boolean') {
      try {
        await this.listGroups();
        planTier = 'MINI';
        supportsGroups = true;
      } catch (err) {
        if (err instanceof AppError && /upgrade|mini|plan/i.test(err.message)) {
          planTier = 'FREE';
          supportsGroups = false;
        }
      }
    }

    const rawUsername = String(record.username ?? record.handle ?? 'ebieshop').replace(
      /^@/,
      ''
    );

    return {
      accountId: String(
        record.id ??
          record.user_id ??
          record.account_id ??
          record.url ??
          rawUsername ??
          'lnkbio_account'
      ),
      username: rawUsername,
      planTier,
      supportsGroups,
      connected: true,
      tokenStatus: 'HEALTHY',
      expiresAt: null,
    };
  }

  async listGroups(): Promise<LnkBioGroup[]> {
    const { envelope } = await this.requestApi<Array<Record<string, unknown>>>(
      '/group/list',
      { method: 'GET' }
    );
    const items = Array.isArray(envelope.data)
      ? envelope.data
      : Array.isArray(envelope.info)
        ? (envelope.info as Array<Record<string, unknown>>)
        : [];
    return items.map((item) => ({
      groupId: String(item.group_id ?? item.id ?? ''),
      groupName: String(item.name ?? item.title ?? item.group_name ?? 'Grup'),
      linkCount: Number(item.count ?? item.link_count ?? 0),
    }));
  }

  async listLinks(): Promise<LnkBioRemoteLink[]> {
    const { envelope } = await this.requestApi<Array<Record<string, unknown>>>(
      '/lnk/list',
      { method: 'GET' }
    );
    const items = Array.isArray(envelope.data) ? envelope.data : [];
    return items.map((item, idx) => ({
      lnkBioId: String(item.lnk_id ?? item.id ?? item.link_id ?? ''),
      title: String(item.title ?? ''),
      link: String(item.link ?? item.url ?? ''),
      ...(item.image ? { imageUrl: String(item.image) } : {}),
      ...(item.group_id ? { groupId: String(item.group_id) } : {}),
      position: Number(item.position ?? idx + 1),
      clicks: Number(item.clicks ?? item.click_count ?? item.views ?? 0),
      ...(item.schedule_from ? { scheduleFrom: String(item.schedule_from) } : {}),
      ...(item.schedule_to ? { scheduleTo: String(item.schedule_to) } : {}),
    }));
  }

  async publishLink(input: LnkBioPublishInput): Promise<LnkBioPublishResult> {
    return this.executeAddOrEdit('/lnk/add', input);
  }

  async editLink(input: LnkBioEditInput): Promise<LnkBioPublishResult> {
    return this.executeAddOrEdit('/lnk/edit', input, input.lnkBioId);
  }

  private extractPublishResult(
    envelope: LnkBioApiEnvelope<Record<string, unknown> | Array<Record<string, unknown>>>,
    fallbackUrl: string,
    httpStatus: number,
    options?: { fallbackId?: string; groupDroppedFallback?: boolean }
  ): LnkBioPublishResult {
    const rawData = Array.isArray(envelope.data)
      ? envelope.data[0]
      : envelope.data ??
        (envelope.info && !Array.isArray(envelope.info) ? envelope.info : undefined);
    const dataObj = (rawData ?? {}) as Record<string, unknown>;
    const rawId =
      dataObj.link_id ??
      dataObj.lnk_id ??
      dataObj.id ??
      envelope.lnk_id ??
      envelope.id ??
      options?.fallbackId;

    return {
      lnkBioId:
        rawId !== undefined && rawId !== null ? String(rawId) : `lnkbio_${Date.now()}`,
      url: String(dataObj.link ?? dataObj.url ?? fallbackUrl),
      ...(options?.groupDroppedFallback ? { groupDroppedFallback: true } : {}),
      httpStatus,
      rawResponse: envelope as unknown as Record<string, unknown>,
    };
  }

  private async executeAddOrEdit(
    path: '/lnk/add' | '/lnk/edit',
    input: LnkBioPublishInput,
    lnkBioId?: string
  ): Promise<LnkBioPublishResult> {
    try {
      const { envelope, httpStatus } = await this.requestApi<
        Record<string, unknown> | Array<Record<string, unknown>>
      >(path, {
        method: 'POST',
        bodyParams: this.buildLinkBodyParams(input, { includeGroupId: true, lnkBioId }),
      });
      return this.extractPublishResult(envelope, input.url, httpStatus, {
        fallbackId: lnkBioId,
      });
    } catch (error) {
      if (
        input.groupId &&
        error instanceof AppError &&
        isMiniPlanGroupRejection(error.statusCode, error.message)
      ) {
        const { envelope, httpStatus } = await this.requestApi<
          Record<string, unknown> | Array<Record<string, unknown>>
        >(path, {
          method: 'POST',
          bodyParams: this.buildLinkBodyParams(input, {
            includeGroupId: false,
            lnkBioId,
          }),
        });
        return this.extractPublishResult(envelope, input.url, httpStatus, {
          fallbackId: lnkBioId,
          groupDroppedFallback: true,
        });
      }
      if (
        input.fallbackDirectUrl &&
        input.fallbackDirectUrl !== input.url &&
        error instanceof AppError &&
        (error.statusCode === 400 || error.statusCode === 502) &&
        /url|link|valid|http|localhost/i.test(error.message)
      ) {
        return this.executeAddOrEdit(
          path,
          { ...input, url: input.fallbackDirectUrl, fallbackDirectUrl: undefined },
          lnkBioId
        );
      }
      throw error;
    }
  }

  async deleteLink(
    lnkBioId: string
  ): Promise<{ deleted: boolean; httpStatus?: number }> {
    const body = new URLSearchParams({ link_id: lnkBioId, lnk_id: lnkBioId });
    const { httpStatus } = await this.requestApi('/lnk/delete', {
      method: 'POST',
      bodyParams: body,
    });
    return { deleted: true, httpStatus };
  }

  async reorderLinks(
    orderedLnkBioIds: string[],
    groupId?: string
  ): Promise<{ reordered: boolean; httpStatus?: number }> {
    const body = new URLSearchParams({
      link_ids: orderedLnkBioIds.join(','),
    });
    if (groupId) {
      body.set('group_id', groupId);
    }
    try {
      const { httpStatus } = await this.requestApi('/lnk/reorder', {
        method: 'POST',
        bodyParams: body,
      });
      return { reordered: true, httpStatus };
    } catch (err) {
      if (
        err instanceof AppError &&
        (err.statusCode === 403 || err.statusCode === 404 || err.statusCode === 502)
      ) {
        const remoteLinks = await this.listLinks();
        const remoteById = new Map(remoteLinks.map((l) => [l.lnkBioId, l]));
        for (let i = 0; i < orderedLnkBioIds.length; i += 1) {
          const id = orderedLnkBioIds[i]!;
          const remote = remoteById.get(id);
          if (remote) {
            await this.editLink({
              lnkBioId: id,
              title: remote.title,
              url: remote.link,
              imageUrl: remote.imageUrl,
              groupId: groupId ?? remote.groupId,
              position: i + 1,
            });
          }
        }
        return { reordered: true, httpStatus: 200 };
      }
      throw err;
    }
  }
}

export class MockLnkBioClient implements ILnkBioClient {
  private counter = 10;
  private readonly links = new Map<string, LnkBioRemoteLink>([
    [
      'mock_lnkbio_001',
      {
        lnkBioId: 'mock_lnkbio_001',
        title: '#001 - Rak Bumbu Dapur 2 Tingkat Baja Karbon Anti Karat',
        link: 'https://shope.ee/mock-rak01',
        groupId: 'grp_dapur_01',
        position: 1,
        clicks: 162,
      },
    ],
    [
      'mock_lnkbio_002',
      {
        lnkBioId: 'mock_lnkbio_002',
        title: '#002 - Lampu Sensor Gerak LED Lemari Dapur USB Rechargeable',
        link: 'https://shope.ee/mock-lampu02',
        groupId: 'grp_dapur_01',
        position: 2,
        clicks: 85,
      },
    ],
  ]);

  async exchangeClientCredentials(): Promise<LnkBioTokenResult> {
    return {
      accessToken: 'mock_lnkbio_access_token',
      refreshToken: 'mock_lnkbio_refresh_token',
      expiresInSec: 86400 * 30,
      tokenType: 'Bearer',
    };
  }

  async exchangeAuthorizationCode(): Promise<LnkBioTokenResult> {
    return this.exchangeClientCredentials();
  }

  async refreshAccessToken(): Promise<LnkBioTokenResult> {
    return this.exchangeClientCredentials();
  }

  async getProfile(): Promise<LnkBioAccountProfile> {
    return {
      accountId: 'mock_acc_ebieshop',
      username: 'ebieshop.id',
      planTier: 'MINI',
      supportsGroups: true,
      connected: true,
      tokenStatus: 'MOCK',
      expiresAt: new Date(Date.now() + 30 * 86400_000).toISOString(),
    };
  }

  async listGroups(): Promise<LnkBioGroup[]> {
    return [
      { groupId: 'grp_dapur_01', groupName: 'Peralatan Dapur', linkCount: 2 },
      { groupId: 'grp_skincare_01', groupName: 'Skincare Viral', linkCount: 0 },
    ];
  }

  async listLinks(): Promise<LnkBioRemoteLink[]> {
    return Array.from(this.links.values()).sort((a, b) => a.position - b.position);
  }

  async publishLink(input: LnkBioPublishInput): Promise<LnkBioPublishResult> {
    this.counter += 1;
    const lnkBioId = `mock_lnkbio_${this.counter}`;
    this.links.set(lnkBioId, {
      lnkBioId,
      title: input.title,
      link: input.url,
      imageUrl: input.imageUrl,
      groupId: input.groupId,
      position: input.position ?? this.links.size + 1,
      clicks: 0,
      scheduleFrom: input.scheduleFrom,
      scheduleTo: input.scheduleTo,
    });
    return {
      lnkBioId,
      url: input.url,
      httpStatus: 200,
      rawResponse: { status: true, data: { lnk_id: lnkBioId } },
    };
  }

  async editLink(input: LnkBioEditInput): Promise<LnkBioPublishResult> {
    const existing = this.links.get(input.lnkBioId);
    this.links.set(input.lnkBioId, {
      lnkBioId: input.lnkBioId,
      title: input.title,
      link: input.url,
      imageUrl: input.imageUrl ?? existing?.imageUrl,
      groupId: input.groupId ?? existing?.groupId,
      position: input.position ?? existing?.position ?? 1,
      clicks: existing?.clicks ?? 0,
      scheduleFrom: input.scheduleFrom,
      scheduleTo: input.scheduleTo,
    });
    return {
      lnkBioId: input.lnkBioId,
      url: input.url,
      httpStatus: 200,
      rawResponse: { status: true, data: { lnk_id: input.lnkBioId } },
    };
  }

  async deleteLink(
    lnkBioId: string
  ): Promise<{ deleted: boolean; httpStatus?: number }> {
    this.links.delete(lnkBioId);
    return { deleted: true, httpStatus: 200 };
  }

  async reorderLinks(
    orderedLnkBioIds: string[]
  ): Promise<{ reordered: boolean; httpStatus?: number }> {
    orderedLnkBioIds.forEach((id, index) => {
      const existing = this.links.get(id);
      if (existing) {
        this.links.set(id, { ...existing, position: index + 1 });
      }
    });
    return { reordered: true, httpStatus: 200 };
  }
}
