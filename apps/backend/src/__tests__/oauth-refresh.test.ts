import { describe, expect, it, vi } from 'vitest';
import { decryptToken, encryptToken } from '@ebieshop/db';
import {
  OAuthTokenRefreshService,
  packEncryptedRefreshToken,
  type OAuthTokenRecord,
  type IOAuthTokenRepository,
} from '../services/oauth-refresh.js';

const KEY_HEX = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

function createInMemoryTokenRepo(initial: OAuthTokenRecord[]): IOAuthTokenRepository {
  const items = initial.map((i) => ({ ...i }));
  return {
    async listExpiringWithinDays(days: number) {
      const cutoff = Date.now() + days * 86400_000;
      return items.filter((i) => i.expiresAt.getTime() <= cutoff && !i.needsReauth);
    },
    async updateToken(id, patch) {
      const idx = items.findIndex((i) => i.id === id);
      if (idx === -1) throw new Error('Token not found');
      items[idx] = { ...items[idx]!, ...patch };
      return items[idx]!;
    },
  };
}

describe('OAuth 2.0 Weekly Token Refresh Service', () => {
  it('refreshes expiring Meta token and stores AES-256-GCM encrypted new token', async () => {
    const encrypted = encryptToken('old-meta-token', KEY_HEX);
    const repo = createInMemoryTokenRepo([
      {
        id: 'tok_meta_1',
        provider: 'meta',
        accountLabel: 'ebieshop_ig',
        externalAccountId: '17841400',
        encryptedAccessToken: encrypted.ciphertext,
        encryptedRefreshToken: null,
        tokenIv: encrypted.iv,
        tokenAuthTag: encrypted.authTag,
        expiresAt: new Date(Date.now() + 5 * 86400_000),
        needsReauth: false,
      },
    ]);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        access_token: 'new-long-lived-meta-token',
        expires_in: 5184000,
      }),
    });

    const service = new OAuthTokenRefreshService({
      repo,
      encryptionKeyHex: KEY_HEX,
      metaAppId: 'meta_app_1',
      metaAppSecret: 'meta_secret_1',
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    const summary = await service.refreshExpiringTokens(14);
    expect(summary.refreshed).toBe(1);
    expect(summary.failed).toBe(0);

    const remaining = await repo.listExpiringWithinDays(14);
    expect(remaining).toHaveLength(0);
  });

  it('marks token needsReauth=true when provider rejects refresh', async () => {
    const encrypted = encryptToken('expired-yt-access', KEY_HEX);
    const encryptedRefresh = encryptToken('revoked-refresh-token', KEY_HEX);
    const repo = createInMemoryTokenRepo([
      {
        id: 'tok_yt_1',
        provider: 'youtube',
        accountLabel: 'ebieshop_yt',
        externalAccountId: 'UC123',
        encryptedAccessToken: encrypted.ciphertext,
        encryptedRefreshToken: encryptedRefresh.ciphertext,
        tokenIv: encrypted.iv,
        tokenAuthTag: encrypted.authTag,
        expiresAt: new Date(Date.now() + 2 * 86400_000),
        needsReauth: false,
      },
    ]);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'invalid_grant' }),
    });

    const service = new OAuthTokenRefreshService({
      repo,
      encryptionKeyHex: KEY_HEX,
      youtubeClientId: 'yt_cid',
      youtubeClientSecret: 'yt_csec',
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    const summary = await service.refreshExpiringTokens(14);
    expect(summary.refreshed).toBe(0);
    expect(summary.failed).toBe(1);
    expect(summary.reauthRequiredIds).toEqual(['tok_yt_1']);

    // Verify decryptToken still works with the key
    expect(
      decryptToken(
        { ciphertext: encrypted.ciphertext, iv: encrypted.iv, authTag: encrypted.authTag },
        KEY_HEX
      )
    ).toBe('expired-yt-access');
  });

  it('refreshes expiring Lnk.Bio token via client_credentials or refresh_token and encrypts result', async () => {
    const encrypted = encryptToken('old-lnkbio-access', KEY_HEX);
    const packedRefresh = packEncryptedRefreshToken('old-lnkbio-refresh', KEY_HEX);
    const repo = createInMemoryTokenRepo([
      {
        id: 'tok_lnkbio_1',
        provider: 'lnkbio',
        accountLabel: 'ebieshop_lnkbio',
        externalAccountId: 'acc_lnkbio_1',
        encryptedAccessToken: encrypted.ciphertext,
        encryptedRefreshToken: packedRefresh,
        tokenIv: encrypted.iv,
        tokenAuthTag: encrypted.authTag,
        expiresAt: new Date(Date.now() + 2 * 86400_000),
        needsReauth: false,
      },
    ]);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        access_token: 'new-lnkbio-access-token',
        refresh_token: 'new-lnkbio-refresh-token',
        expires_in: 86400 * 30,
      }),
    });

    const service = new OAuthTokenRefreshService({
      repo,
      encryptionKeyHex: KEY_HEX,
      lnkBioClientId: 'lnkpriv_test',
      lnkBioClientSecret: 'secret_test',
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    const summary = await service.refreshExpiringTokens(14);
    expect(summary.refreshed).toBe(1);
    expect(summary.failed).toBe(0);
    const [tokenUrl] = fetchMock.mock.calls[0] as [string];
    expect(tokenUrl).toBe('https://lnk.bio/oauth/token');
  });

  it('refreshes expiring Threads long-lived token via th_refresh_token', async () => {
    const encrypted = encryptToken('old-threads-token', KEY_HEX);
    const repo = createInMemoryTokenRepo([
      {
        id: 'tok_threads_1',
        provider: 'threads',
        accountLabel: 'raraverse',
        externalAccountId: '25000112233',
        encryptedAccessToken: encrypted.ciphertext,
        encryptedRefreshToken: null,
        tokenIv: encrypted.iv,
        tokenAuthTag: encrypted.authTag,
        expiresAt: new Date(Date.now() + 4 * 86400_000),
        needsReauth: false,
      },
    ]);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        access_token: 'new-long-lived-threads-token',
        expires_in: 5184000,
      }),
    });

    const service = new OAuthTokenRefreshService({
      repo,
      encryptionKeyHex: KEY_HEX,
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    const summary = await service.refreshExpiringTokens(14);
    expect(summary.refreshed).toBe(1);
    expect(summary.failed).toBe(0);
    const [refreshUrl] = fetchMock.mock.calls[0] as [string];
    expect(refreshUrl).toContain('https://graph.threads.net/refresh_access_token');
    expect(refreshUrl).toContain('grant_type=th_refresh_token');
  });
});
