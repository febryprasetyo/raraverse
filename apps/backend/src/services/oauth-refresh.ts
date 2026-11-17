import { decryptToken, encryptToken } from '@ebieshop/db';

export interface OAuthTokenRecord {
  id: string;
  provider: 'meta' | 'youtube';
  accountLabel: string;
  externalAccountId: string;
  encryptedAccessToken: string;
  encryptedRefreshToken: string | null;
  tokenIv: string;
  tokenAuthTag: string;
  expiresAt: Date;
  needsReauth: boolean;
}

export interface IOAuthTokenRepository {
  listExpiringWithinDays(days: number): Promise<OAuthTokenRecord[]>;
  updateToken(
    id: string,
    patch: Partial<OAuthTokenRecord> & { lastRefreshedAt?: Date }
  ): Promise<OAuthTokenRecord>;
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
        } else {
          await this.refreshYoutubeToken(token);
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
    const refreshToken = decryptToken(
      {
        ciphertext: token.encryptedRefreshToken,
        iv: token.tokenIv,
        authTag: token.tokenAuthTag,
      },
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
}
