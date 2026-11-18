import { encryptToken } from '@ebieshop/db';
import type {
  Product,
  ThreadsAccountProfile,
  ThreadsMediaType,
  ThreadsOverview,
  ThreadsPostRecord,
  ThreadsSyncLog,
  ThreadsSyncOperation,
} from '@ebieshop/shared';
import type {
  ILlmProvider,
  IProductRepository,
  IThreadsRepository,
} from '../adapters/contracts.js';
import { buildDefaultThreadsCopy } from '../adapters/llm-providers.js';
import type { IThreadsClient } from '../adapters/threads-client.js';
import type { EnvConfig } from '../config/env.js';
import { loadLocalDevEnvInto, resolveTokenEncryptionKey } from '../config/env.js';
import { BadRequestError, NotFoundError } from '../errors.js';
import { resolvePrimaryAffiliateTargetUrl } from './lnkbio-automation.js';
import type { IOAuthTokenRepository } from './oauth-refresh.js';

const PRIVATE_OR_LOCAL_HOST_REGEX =
  /^(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|::1|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|169\.254\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)$/i;

export function isPublicHttpsUrl(rawUrl?: string | null): boolean {
  if (!rawUrl?.trim()) return false;
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    if (
      !host ||
      PRIVATE_OR_LOCAL_HOST_REGEX.test(host) ||
      host.endsWith('.local') ||
      host.endsWith('.internal')
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function sanitizeThreadsLogPayload(
  payload: Record<string, unknown> | null
): Record<string, unknown> | null {
  if (!payload) return null;
  const copy: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (/secret|token|authorization|password|code/i.test(k)) {
      copy[k] = '[REDACTED]';
    } else {
      copy[k] = v;
    }
  }
  return copy;
}

export class ThreadsAutomationService {
  private hasAppTokenVerified = false;
  private cachedUserProfile: { userId: string; username: string; displayName: string } | null =
    null;

  constructor(
    private readonly options: {
      env: EnvConfig;
      client: IThreadsClient;
      repo: IThreadsRepository;
      products: IProductRepository;
      llm: ILlmProvider;
      oauthTokens?: IOAuthTokenRepository;
    }
  ) {}

  private getDisplayName(): string {
    return this.options.env.THREADS_DISPLAY_NAME?.trim() || 'raraverse';
  }

  private getDefaultRedirectUri(): string {
    return (
      this.options.env.THREADS_REDIRECT_URI?.trim() ||
      'https://localhost:3000/products/threads'
    );
  }

  private resolveAffiliateUrl(product: Product): string {
    const direct = resolvePrimaryAffiliateTargetUrl(product.affiliateUrls);
    if (!direct) {
      throw new BadRequestError(
        'Isi Shopee/TikTok/Tokopedia Shortlink produk terlebih dahulu sebelum memublikasikan ke Threads'
      );
    }

    const publicRedirectBase =
      this.options.env.PUBLIC_REDIRECT_BASE_URL ??
      (this.options.env.NODE_ENV === 'development'
        ? process.env.PUBLIC_REDIRECT_BASE_URL
        : undefined);

    if (isPublicHttpsUrl(publicRedirectBase)) {
      const code = (product.triggerKeyword || `P${product.biolinkNumber}`).toUpperCase();
      return `${publicRedirectBase!.trim().replace(/\/+$/, '')}/r/${encodeURIComponent(code)}`;
    }

    return direct;
  }

  private resolveMediaForThreads(
    requestedType: ThreadsMediaType,
    requestedUrl: string | undefined,
    product: Product
  ): { mediaType: ThreadsMediaType; mediaUrl: string | null } {
    if (requestedType === 'TEXT') {
      return { mediaType: 'TEXT', mediaUrl: null };
    }
    const candidate = requestedUrl?.trim() || product.kalodataSnapshot?.imageUrl;
    if (isPublicHttpsUrl(candidate)) {
      return { mediaType: requestedType, mediaUrl: candidate! };
    }
    return { mediaType: 'TEXT', mediaUrl: null };
  }

  private async logOperation(input: {
    productId: string | null;
    threadsPostId: string | null;
    operation: ThreadsSyncOperation;
    status: 'SUCCESS' | 'FAILED';
    httpStatus: number | null;
    requestPayload: Record<string, unknown> | null;
    responsePayload: Record<string, unknown> | null;
    errorMessage: string | null;
    durationMs: number;
  }): Promise<ThreadsSyncLog> {
    return this.options.repo.createSyncLog({
      productId: input.productId,
      threadsPostId: input.threadsPostId,
      operation: input.operation,
      status: input.status,
      httpStatus: input.httpStatus,
      requestPayload: sanitizeThreadsLogPayload(input.requestPayload),
      responsePayload: sanitizeThreadsLogPayload(input.responsePayload),
      errorMessage: input.errorMessage,
      durationMs: input.durationMs,
    });
  }

  getAuthorizeUrl(input?: { redirectUri?: string; scopes?: string[] }) {
    loadLocalDevEnvInto(process.env);
    const redirectUri = input?.redirectUri?.trim() || this.getDefaultRedirectUri();
    return this.options.client.getAuthorizeUrl({
      redirectUri,
      scopes: input?.scopes,
    });
  }

  private async saveUserToken(input: {
    accessToken: string;
    userId: string;
    username: string;
    expiresInSec: number;
  }): Promise<Date> {
    const expiresAt = new Date(Date.now() + input.expiresInSec * 1000);
    const encKeyHex = resolveTokenEncryptionKey(this.options.env);
    if (this.options.env.DATA_SOURCE_MODE === 'real' && !encKeyHex) {
      throw new BadRequestError(
        'TOKEN_ENCRYPTION_KEY wajib dikonfigurasi untuk menyimpan token OAuth Threads'
      );
    }

    if (this.options.oauthTokens?.upsertToken && encKeyHex) {
      const encrypted = encryptToken(input.accessToken, encKeyHex);
      await this.options.oauthTokens.upsertToken({
        provider: 'threads',
        accountLabel: input.username,
        externalAccountId: input.userId,
        encryptedAccessToken: encrypted.ciphertext,
        encryptedRefreshToken: null,
        tokenIv: encrypted.iv,
        tokenAuthTag: encrypted.authTag,
        scopes:
          'threads_basic,threads_content_publish,threads_manage_replies,threads_read_replies',
        expiresAt,
        needsReauth: false,
      });
    }
    return expiresAt;
  }

  async connectOAuth(input: {
    mode: 'authorization_code' | 'client_credentials' | 'access_token';
    code?: string;
    redirectUri?: string;
    accessToken?: string;
  }): Promise<{
    connected: true;
    tokenType: 'USER' | 'APP';
    profile: ThreadsAccountProfile;
    expiresAt: string;
  }> {
    const startedAt = Date.now();
    loadLocalDevEnvInto(process.env);

    const operation: ThreadsSyncOperation =
      input.mode === 'client_credentials'
        ? 'AUTH_APP'
        : input.mode === 'authorization_code'
          ? 'AUTH_CODE'
          : 'AUTH_TOKEN';

    try {
      if (input.mode === 'client_credentials') {
        const appTok = await this.options.client.exchangeAppClientCredentials();
        this.hasAppTokenVerified = true;
        const expiresAt = new Date(Date.now() + appTok.expiresInSec * 1000);
        const profile = await this.buildProfile(expiresAt.toISOString());

        await this.logOperation({
          productId: null,
          threadsPostId: null,
          operation,
          status: 'SUCCESS',
          httpStatus: 200,
          requestPayload: { mode: input.mode },
          responsePayload: { tokenType: 'APP', appId: profile.appId },
          errorMessage: null,
          durationMs: Date.now() - startedAt,
        });

        return {
          connected: true,
          tokenType: 'APP',
          profile,
          expiresAt: expiresAt.toISOString(),
        };
      }

      let accessToken: string;
      let expiresInSec = 60 * 86400;

      if (input.mode === 'authorization_code') {
        if (!input.code?.trim()) {
          throw new BadRequestError(
            'Parameter code wajib diisi untuk authorization_code Threads'
          );
        }
        const redirectUri =
          input.redirectUri?.trim() || this.getDefaultRedirectUri();
        const tok = await this.options.client.exchangeAuthorizationCode(
          input.code,
          redirectUri
        );
        accessToken = tok.accessToken;
        expiresInSec = tok.expiresInSec;
      } else {
        const directToken =
          input.accessToken?.trim() ||
          this.options.env.THREADS_ACCESS_TOKEN?.trim() ||
          process.env.THREADS_ACCESS_TOKEN?.trim();
        if (!directToken) {
          throw new BadRequestError(
            'THREADS_ACCESS_TOKEN wajib diisi untuk mode access_token'
          );
        }
        accessToken = directToken;
      }

      const remoteProfile = await this.options.client.getProfile(accessToken);
      this.cachedUserProfile = remoteProfile;
      const expiresAt = await this.saveUserToken({
        accessToken,
        userId: remoteProfile.userId,
        username: remoteProfile.username,
        expiresInSec,
      });

      const profile = await this.buildProfile(expiresAt.toISOString());

      await this.logOperation({
        productId: null,
        threadsPostId: null,
        operation,
        status: 'SUCCESS',
        httpStatus: 200,
        requestPayload: { mode: input.mode },
        responsePayload: {
          tokenType: 'USER',
          userId: remoteProfile.userId,
          username: remoteProfile.username,
        },
        errorMessage: null,
        durationMs: Date.now() - startedAt,
      });

      return {
        connected: true,
        tokenType: 'USER',
        profile,
        expiresAt: expiresAt.toISOString(),
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      await this.logOperation({
        productId: null,
        threadsPostId: null,
        operation,
        status: 'FAILED',
        httpStatus: null,
        requestPayload: { mode: input.mode },
        responsePayload: null,
        errorMessage: msg,
        durationMs: Date.now() - startedAt,
      });
      throw error;
    }
  }

  async generateDraft(
    productId: string,
    requestedMediaType: ThreadsMediaType = 'TEXT'
  ): Promise<{
    rootText: string;
    replyText: string;
    affiliateUrl: string;
    mediaUrl: string | null;
    resolvedMediaType: ThreadsMediaType;
  }> {
    const product = await this.options.products.getProductById(productId);
    if (!product) {
      throw new NotFoundError(`Product '${productId}' not found`);
    }

    const affiliateUrl = this.resolveAffiliateUrl(product);
    const { mediaType, mediaUrl } = this.resolveMediaForThreads(
      requestedMediaType,
      undefined,
      product
    );

    const copy = this.options.llm.generateThreadsCopy
      ? await this.options.llm.generateThreadsCopy({ product, affiliateUrl })
      : buildDefaultThreadsCopy(product, affiliateUrl);

    return {
      rootText: copy.rootText,
      replyText: copy.replyText,
      affiliateUrl,
      mediaUrl,
      resolvedMediaType: mediaType,
    };
  }

  async publishProductThread(input: {
    productId: string;
    mediaType?: ThreadsMediaType;
    rootText?: string;
    replyText?: string;
    mediaUrl?: string;
  }): Promise<{ post: ThreadsPostRecord; product: Product }> {
    const product = await this.options.products.getProductById(input.productId);
    if (!product) {
      throw new NotFoundError(`Product '${input.productId}' not found`);
    }

    const affiliateUrl = this.resolveAffiliateUrl(product);
    const { mediaType, mediaUrl } = this.resolveMediaForThreads(
      input.mediaType ?? 'TEXT',
      input.mediaUrl,
      product
    );

    let rootText = input.rootText?.trim();
    let replyText = input.replyText?.trim();
    if (!rootText || !replyText) {
      const generated = this.options.llm.generateThreadsCopy
        ? await this.options.llm.generateThreadsCopy({ product, affiliateUrl })
        : buildDefaultThreadsCopy(product, affiliateUrl);
      rootText = rootText || generated.rootText;
      replyText = replyText || generated.replyText;
    }

    const startedAt = Date.now();
    const requestPayload = {
      mediaType,
      hasMediaUrl: Boolean(mediaUrl),
      affiliateUrl,
    };

    try {
      const result = await this.options.client.publishChainedThread({
        mediaType,
        rootText,
        replyText,
        ...(mediaUrl ? { mediaUrl } : {}),
        ...(this.options.env.THREADS_USER_ID
          ? { userId: this.options.env.THREADS_USER_ID }
          : {}),
      });

      const status = result.partialError ? 'PARTIAL_ROOT_ONLY' : 'PUBLISHED';
      const nowIso = new Date().toISOString();
      const post = await this.options.repo.createPost({
        productId: product.id,
        rootPostId: result.rootPostId,
        replyPostId: result.replyPostId,
        permalink: result.permalink,
        username: result.username ?? this.getDisplayName(),
        mediaType,
        rootText,
        replyText,
        mediaUrl,
        affiliateUrl,
        status,
        errorMessage: result.partialError ?? null,
        publishedAt: nowIso,
      });

      const updatedProduct = await this.options.products.updateProduct(product.id, {
        affiliateUrls: {
          ...product.affiliateUrls,
          threadsPostId: result.rootPostId,
          ...(result.replyPostId ? { threadsReplyId: result.replyPostId } : {}),
          ...(result.permalink ? { threadsPermalink: result.permalink } : {}),
        },
      });

      await this.logOperation({
        productId: product.id,
        threadsPostId: post.id,
        operation: 'PUBLISH_CHAIN',
        status: result.partialError ? 'FAILED' : 'SUCCESS',
        httpStatus: result.httpStatus,
        requestPayload,
        responsePayload: {
          rootPostId: result.rootPostId,
          replyPostId: result.replyPostId,
          permalink: result.permalink,
        },
        errorMessage: result.partialError ?? null,
        durationMs: Date.now() - startedAt,
      });

      return { post, product: updatedProduct };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      const failedPost = await this.options.repo.createPost({
        productId: product.id,
        rootPostId: null,
        replyPostId: null,
        permalink: null,
        username: this.getDisplayName(),
        mediaType,
        rootText,
        replyText,
        mediaUrl,
        affiliateUrl,
        status: 'FAILED',
        errorMessage: msg,
        publishedAt: null,
      });

      await this.logOperation({
        productId: product.id,
        threadsPostId: failedPost.id,
        operation: 'PUBLISH_CHAIN',
        status: 'FAILED',
        httpStatus: null,
        requestPayload,
        responsePayload: null,
        errorMessage: msg,
        durationMs: Date.now() - startedAt,
      });
      throw error;
    }
  }

  private async buildProfile(overrideExpiresAt?: string): Promise<ThreadsAccountProfile> {
    const isMock =
      this.options.env.THREADS_MODE === 'mock' &&
      !this.options.env.THREADS_ACCESS_TOKEN;

    if (isMock) {
      return {
        appId: this.options.env.THREADS_APP_ID ?? '1811443116804615',
        userId: '25000112233',
        username: this.getDisplayName(),
        displayName: this.getDisplayName(),
        connected: true,
        hasUserToken: true,
        hasAppToken: true,
        tokenStatus: 'MOCK',
        expiresAt: new Date(Date.now() + 60 * 86400_000).toISOString(),
      };
    }

    const storedToken = this.options.oauthTokens?.getTokenByProvider
      ? await this.options.oauthTokens.getTokenByProvider('threads')
      : null;

    const hasEnvUserToken = Boolean(this.options.env.THREADS_ACCESS_TOKEN);
    const hasUserToken =
      hasEnvUserToken || Boolean(storedToken && !storedToken.needsReauth);

    const tokenStatus = hasUserToken
      ? 'USER_TOKEN'
      : this.hasAppTokenVerified
        ? 'APP_TOKEN'
        : 'NEEDS_REAUTH';

    return {
      appId: this.options.env.THREADS_APP_ID ?? '',
      userId:
        this.cachedUserProfile?.userId ??
        storedToken?.externalAccountId ??
        this.options.env.THREADS_USER_ID ??
        null,
      username:
        this.cachedUserProfile?.username ??
        storedToken?.accountLabel ??
        this.getDisplayName(),
      displayName: this.cachedUserProfile?.displayName ?? this.getDisplayName(),
      connected: hasUserToken || this.hasAppTokenVerified,
      hasUserToken,
      hasAppToken: this.hasAppTokenVerified,
      tokenStatus,
      expiresAt:
        overrideExpiresAt ??
        (storedToken ? storedToken.expiresAt.toISOString() : null),
    };
  }

  async getOverview(): Promise<ThreadsOverview> {
    const [profile, posts, logs] = await Promise.all([
      this.buildProfile(),
      this.options.repo.listPosts({ limit: 30 }),
      this.options.repo.listSyncLogs({ limit: 30 }),
    ]);
    return { profile, posts, logs };
  }

  async listLogs(filter?: {
    limit?: number;
    operation?: ThreadsSyncOperation;
    status?: 'SUCCESS' | 'FAILED';
  }): Promise<ThreadsSyncLog[]> {
    return this.options.repo.listSyncLogs(filter);
  }
}
