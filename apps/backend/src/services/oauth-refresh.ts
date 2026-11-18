import { decryptToken, encryptToken } from '@ebieshop/db';

export function packEncryptedRefreshToken(plaintext: string, keyHex: string): string {
  const enc = encryptToken(plaintext, keyHex);
  return `${enc.iv}:${enc.authTag}:${enc.ciphertext}`;
}

export function unpackEncryptedRefreshToken(
  packed: string,
  fallbackIv: string,
  fallbackAuthTag: string,
  keyHex: string
): string {
  const parts = packed.split(':');
  if (
    parts.length === 3 &&
    /^[0-9a-f]{24}$/i.test(parts[0]!) &&
    /^[0-9a-f]{32}$/i.test(parts[1]!)
  ) {
    return decryptToken(
      {
        iv: parts[0]!,
        authTag: parts[1]!,
        ciphertext: parts[2]!,
      },
      keyHex
    );
  }
  return decryptToken(
    {
      ciphertext: packed,
      iv: fallbackIv,
      authTag: fallbackAuthTag,
    },
    keyHex
  );
}

export type OAuthProviderName = 'meta' | 'youtube' | 'lnkbio' | 'threads';

export interface OAuthTokenRecord {
  id: string;
  provider: OAuthProviderName;
  accountLabel: string;
  externalAccountId: string;
  encryptedAccessToken: string;
  encryptedRefreshToken: string | null;
  tokenIv: string;
  tokenAuthTag: string;
  expiresAt: Date;
  needsReauth: boolean;
}

export interface UpsertOAuthTokenInput {
  provider: OAuthProviderName;
  accountLabel: string;
  externalAccountId: string;
  encryptedAccessToken: string;
  encryptedRefreshToken: string | null;
  tokenIv: string;
  tokenAuthTag: string;
  scopes: string;
  expiresAt: Date;
  needsReauth: boolean;
}

export interface IOAuthTokenRepository {
  listExpiringWithinDays(days: number): Promise<OAuthTokenRecord[]>;
  updateToken(
    id: string,
    patch: Partial<OAuthTokenRecord> & { lastRefreshedAt?: Date }
  ): Promise<OAuthTokenRecord>;
  getTokenByProvider?(provider: OAuthProviderName): Promise<OAuthTokenRecord | null>;
  upsertToken?(input: UpsertOAuthTokenInput): Promise<OAuthTokenRecord>;
}

export interface OAuthRefreshSummary {
  checked: number;
  refreshed: number;
  failed: number;
  reauthRequiredIds: string[];
}

export class OAuthTokenRefreshService {
  private readonly fetchFn: typeof fetch;

  constructor(
    private readonly options: {
      repo: IOAuthTokenRepository;
      encryptionKeyHex: string;
      metaAppId?: string;
      metaAppSecret?: string;
      youtubeClientId?: string;
      youtubeClientSecret?: string;
      lnkBioClientId?: string;
      lnkBioClientSecret?: string;
      fetchFn?: typeof fetch;
    }
  ) {
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async refreshExpiringTokens(withinDays = 14): Promise<OAuthRefreshSummary> {
    const expiring = await this.options.repo.listExpiringWithinDays(withinDays);
    let refreshed = 0;
    let failed = 0;
    const reauthRequiredIds: string[] = [];

    for (const token of expiring) {
      try {
        if (token.provider === 'meta') {
          await this.refreshMetaToken(token);
        } else if (token.provider === 'youtube') {
          await this.refreshYoutubeToken(token);
        } else if (token.provider === 'threads') {
          await this.refreshThreadsToken(token);
        } else {
          await this.refreshLnkBioToken(token);
        }
        refreshed += 1;
      } catch {
        failed += 1;
        reauthRequiredIds.push(token.id);
        await this.options.repo.updateToken(token.id, {
          needsReauth: true,
        });
      }
    }

    return {
      checked: expiring.length,
      refreshed,
      failed,
      reauthRequiredIds,
    };
  }

  private async refreshMetaToken(token: OAuthTokenRecord): Promise<void> {
    const currentAccess = decryptToken(
      {
        ciphertext: token.encryptedAccessToken,
        iv: token.tokenIv,
        authTag: token.tokenAuthTag,
      },
      this.options.encryptionKeyHex
    );

    const params = new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: this.options.metaAppId ?? '',
      client_secret: this.options.metaAppSecret ?? '',
      fb_exchange_token: currentAccess,
    });

    const res = await this.fetchFn(
      `https://graph.facebook.com/v21.0/oauth/access_token?${params.toString()}`
    );
    if (!res.ok) {
      throw new Error(`Meta token refresh failed (${res.status})`);
    }
    const data = (await res.json()) as {
      access_token: string;
      expires_in?: number;
    };

    const encrypted = encryptToken(data.access_token, this.options.encryptionKeyHex);
    const expiresInSec = data.expires_in ?? 60 * 86400;

    await this.options.repo.updateToken(token.id, {
      encryptedAccessToken: encrypted.ciphertext,
      tokenIv: encrypted.iv,
      tokenAuthTag: encrypted.authTag,
      expiresAt: new Date(Date.now() + expiresInSec * 1000),
      lastRefreshedAt: new Date(),
      needsReauth: false,
    });
  }

  private async refreshYoutubeToken(token: OAuthTokenRecord): Promise<void> {
    if (!token.encryptedRefreshToken) {
      throw new Error('Missing encryptedRefreshToken for YouTube token');
    }
    const refreshToken = unpackEncryptedRefreshToken(
      token.encryptedRefreshToken,
      token.tokenIv,
      token.tokenAuthTag,
      this.options.encryptionKeyHex
    );

    const res = await this.fetchFn('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.options.youtubeClientId ?? '',
        client_secret: this.options.youtubeClientSecret ?? '',
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!res.ok) {
      throw new Error(`YouTube token refresh failed (${res.status})`);
    }

    const data = (await res.json()) as {
      access_token: string;
      expires_in?: number;
    };
    const encrypted = encryptToken(data.access_token, this.options.encryptionKeyHex);
    const expiresInSec = data.expires_in ?? 3600;

    await this.options.repo.updateToken(token.id, {
      encryptedAccessToken: encrypted.ciphertext,
      tokenIv: encrypted.iv,
      tokenAuthTag: encrypted.authTag,
      expiresAt: new Date(Date.now() + expiresInSec * 1000),
      lastRefreshedAt: new Date(),
      needsReauth: false,
    });
  }

  private async refreshLnkBioToken(token: OAuthTokenRecord): Promise<void> {
    const clientId = this.options.lnkBioClientId ?? '';
    const clientSecret = this.options.lnkBioClientSecret ?? '';
    if (!clientId || !clientSecret) {
      throw new Error('LNKBIO_CLIENT_ID and LNKBIO_CLIENT_SECRET are required');
    }

    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
    });

    if (token.encryptedRefreshToken) {
      const refreshToken = unpackEncryptedRefreshToken(
        token.encryptedRefreshToken,
        token.tokenIv,
        token.tokenAuthTag,
        this.options.encryptionKeyHex
      );
      body.set('grant_type', 'refresh_token');
      body.set('refresh_token', refreshToken);
    } else {
      body.set('grant_type', 'client_credentials');
    }

    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const res = await this.fetchFn('https://lnk.bio/oauth/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: body.toString(),
    });
    if (!res.ok) {
      throw new Error(`Lnk.Bio token refresh failed (${res.status})`);
    }
    const data = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };

    const encrypted = encryptToken(data.access_token, this.options.encryptionKeyHex);
    const encryptedRefresh = data.refresh_token
      ? packEncryptedRefreshToken(data.refresh_token, this.options.encryptionKeyHex)
      : null;
    const expiresInSec = data.expires_in ?? 30 * 86400;

    await this.options.repo.updateToken(token.id, {
      encryptedAccessToken: encrypted.ciphertext,
      ...(encryptedRefresh ? { encryptedRefreshToken: encryptedRefresh } : {}),
      tokenIv: encrypted.iv,
      tokenAuthTag: encrypted.authTag,
      expiresAt: new Date(Date.now() + expiresInSec * 1000),
      lastRefreshedAt: new Date(),
      needsReauth: false,
    });
  }

  private async refreshThreadsToken(token: OAuthTokenRecord): Promise<void> {
    const currentAccess = decryptToken(
      {
        ciphertext: token.encryptedAccessToken,
        iv: token.tokenIv,
        authTag: token.tokenAuthTag,
      },
      this.options.encryptionKeyHex
    );

    const params = new URLSearchParams({
      grant_type: 'th_refresh_token',
      access_token: currentAccess,
    });

    const res = await this.fetchFn(
      `https://graph.threads.net/refresh_access_token?${params.toString()}`
    );
    if (!res.ok) {
      throw new Error(`Threads token refresh failed (${res.status})`);
    }
    const data = (await res.json()) as {
      access_token: string;
      expires_in?: number;
    };

    const encrypted = encryptToken(data.access_token, this.options.encryptionKeyHex);
    const expiresInSec = data.expires_in ?? 60 * 86400;

    await this.options.repo.updateToken(token.id, {
      encryptedAccessToken: encrypted.ciphertext,
      tokenIv: encrypted.iv,
      tokenAuthTag: encrypted.authTag,
      expiresAt: new Date(Date.now() + expiresInSec * 1000),
      lastRefreshedAt: new Date(),
      needsReauth: false,
    });
  }
}
