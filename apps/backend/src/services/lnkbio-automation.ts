import { encryptToken } from '@ebieshop/db';
import type {
  AffiliateLink,
  LnkBioAccountProfile,
  LnkBioGroup,
  LnkBioMetricsSnapshot,
  LnkBioOverview,
  LnkBioSyncLog,
  LnkBioSyncOperation,
  Product,
} from '@ebieshop/shared';
import type {
  IAnalyticsRepository,
  ILnkBioRepository,
  IProductRepository,
} from '../adapters/contracts.js';
import type { ILnkBioClient } from '../adapters/lnkbio-client.js';
import type { EnvConfig } from '../config/env.js';
import { loadLocalDevEnvInto, resolveTokenEncryptionKey } from '../config/env.js';
import { BadRequestError, NotFoundError } from '../errors.js';
import {
  packEncryptedRefreshToken,
  type IOAuthTokenRepository,
} from './oauth-refresh.js';

const PRIVATE_OR_LOCAL_HOST_REGEX =
  /^(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|::1|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|169\.254\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)$/i;

export function assertSafeAffiliateUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new BadRequestError(`URL affiliate tidak valid: ${rawUrl}`);
  }

  if (parsed.protocol !== 'https:') {
    throw new BadRequestError('URL affiliate wajib menggunakan protokol HTTPS');
  }

  const host = parsed.hostname.toLowerCase();
  if (
    !host ||
    PRIVATE_OR_LOCAL_HOST_REGEX.test(host) ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    throw new BadRequestError(`Host tujuan tidak diizinkan: ${host}`);
  }

  return parsed;
}

export function resolvePrimaryAffiliateTargetUrl(
  affiliateUrls: Product['affiliateUrls']
): string | undefined {
  return (
    affiliateUrls.shopeeShortlink ??
    affiliateUrls.tiktokShortlink ??
    affiliateUrls.tokopediaShortlink ??
    affiliateUrls.biolinkAnchorUrl
  );
}

export function buildHybridTrackedUrl(input: {
  targetUrl: string;
  redirectCode: string;
  triggerKeyword?: string;
  publicRedirectBaseUrl?: string;
}): string {
  const safeTarget = assertSafeAffiliateUrl(input.targetUrl);
  const code = input.redirectCode.toUpperCase();

  if (input.publicRedirectBaseUrl?.trim()) {
    const base = input.publicRedirectBaseUrl.trim().replace(/\/+$/, '');
    return `${base}/r/${encodeURIComponent(code)}`;
  }

  return safeTarget.toString();
}

export function buildRedirectDestinationUrl(targetUrl: string): string {
  const safeTarget = assertSafeAffiliateUrl(targetUrl);
  return safeTarget.toString();
}

export function computeLinkPerformanceScore(input: {
  totalTrackedClicks: number;
  estimatedCommissionIdr: number;
  commissionRatePct?: number;
}): number {
  const clickScore = input.totalTrackedClicks * 10;
  const commissionScore = Math.round(input.estimatedCommissionIdr / 1000);
  const rateBonus = Math.round((input.commissionRatePct ?? 0) * 2);
  return clickScore + commissionScore + rateBonus;
}

function isMockLnkBioId(id: string | null | undefined): boolean {
  return Boolean(id && /^mock_lnkbio_/i.test(id));
}

function sanitizeLogPayload(
  payload: Record<string, unknown> | null
): Record<string, unknown> | null {
  if (!payload) return null;
  const copy: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (/secret|token|authorization|password/i.test(k)) {
      copy[k] = '[REDACTED]';
    } else {
      copy[k] = v;
    }
  }
  return copy;
}

export class LnkBioAutomationService {
  constructor(
    private readonly options: {
      env: EnvConfig;
      client: ILnkBioClient;
      repo: ILnkBioRepository;
      products: IProductRepository;
      analytics: IAnalyticsRepository;
      oauthTokens?: IOAuthTokenRepository;
    }
  ) {}

  private getPublicRedirectBaseUrl(): string | undefined {
    const raw =
      this.options.env.PUBLIC_REDIRECT_BASE_URL ??
      (this.options.env.NODE_ENV === 'development'
        ? process.env.PUBLIC_REDIRECT_BASE_URL
        : undefined);
    const trimmed = raw?.trim();
    return trimmed ? trimmed : undefined;
  }

  private async logOperation(input: {
    productId: string | null;
    affiliateLinkId: string | null;
    operation: LnkBioSyncOperation;
    status: 'SUCCESS' | 'FAILED';
    httpStatus: number | null;
    requestPayload: Record<string, unknown> | null;
    responsePayload: Record<string, unknown> | null;
    errorMessage: string | null;
    durationMs: number;
  }): Promise<LnkBioSyncLog> {
    return this.options.repo.createSyncLog({
      productId: input.productId,
      affiliateLinkId: input.affiliateLinkId,
      operation: input.operation,
      status: input.status,
      httpStatus: input.httpStatus,
      requestPayload: sanitizeLogPayload(input.requestPayload),
      responsePayload: sanitizeLogPayload(input.responsePayload),
      errorMessage: input.errorMessage,
      attemptCount: 1,
      durationMs: input.durationMs,
    });
  }

  getAuthorizeUrl(redirectUri?: string): { authorizeUrl: string; state: string } {
    const clientId = this.options.env.LNKBIO_CLIENT_ID ?? 'lnkpriv_unconfigured';
    const resolvedRedirect =
      redirectUri ??
      this.options.env.LNKBIO_REDIRECT_URI ??
      'http://localhost:3000/products/lnkbio';
    const state = `ebieshop_${Date.now().toString(36)}`;
    const url = new URL('https://lnk.bio/manage/access');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', resolvedRedirect);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('state', state);
    return { authorizeUrl: url.toString(), state };
  }

  async connectOAuth(input: {
    mode: 'client_credentials' | 'authorization_code';
    code?: string;
    redirectUri?: string;
  }): Promise<{
    connected: true;
    profile: LnkBioAccountProfile;
    expiresAt: string;
  }> {
    const startedAt = Date.now();
    try {
      loadLocalDevEnvInto(process.env);
      const tokenRes =
        input.mode === 'authorization_code'
          ? await this.options.client.exchangeAuthorizationCode(
              input.code ?? '',
              input.redirectUri ??
                this.options.env.LNKBIO_REDIRECT_URI ??
                'http://localhost:3000/products/lnkbio'
            )
          : await this.options.client.exchangeClientCredentials();

      const profile = await this.options.client.getProfile();
      const expiresAt = new Date(Date.now() + tokenRes.expiresInSec * 1000);

      const encKeyHex = resolveTokenEncryptionKey(this.options.env);
      if (this.options.env.DATA_SOURCE_MODE === 'real' && !encKeyHex) {
        throw new BadRequestError(
          'TOKEN_ENCRYPTION_KEY wajib dikonfigurasi untuk menyimpan token OAuth Lnk.Bio'
        );
      }

      if (this.options.oauthTokens?.upsertToken && encKeyHex) {
        const encryptedAccess = encryptToken(tokenRes.accessToken, encKeyHex);
        const encryptedRefresh = tokenRes.refreshToken
          ? packEncryptedRefreshToken(tokenRes.refreshToken, encKeyHex)
          : null;

        await this.options.oauthTokens.upsertToken({
          provider: 'lnkbio',
          accountLabel: profile.username,
          externalAccountId: profile.accountId,
          encryptedAccessToken: encryptedAccess.ciphertext,
          encryptedRefreshToken: encryptedRefresh,
          tokenIv: encryptedAccess.iv,
          tokenAuthTag: encryptedAccess.authTag,
          scopes: 'lnk.read,lnk.write',
          expiresAt,
          needsReauth: false,
        });
      }

      await this.logOperation({
        productId: null,
        affiliateLinkId: null,
        operation: 'AUTH_TOKEN',
        status: 'SUCCESS',
        httpStatus: 200,
        requestPayload: { mode: input.mode },
        responsePayload: { username: profile.username, planTier: profile.planTier },
        errorMessage: null,
        durationMs: Date.now() - startedAt,
      });

      return {
        connected: true,
        profile: {
          ...profile,
          expiresAt: expiresAt.toISOString(),
        },
        expiresAt: expiresAt.toISOString(),
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      await this.logOperation({
        productId: null,
        affiliateLinkId: null,
        operation: 'AUTH_TOKEN',
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

  async publishOrUpdateProductLink(input: {
    product: Product;
    overrideTitle?: string;
    groupId?: string | null;
    scheduleFrom?: string | null;
    scheduleTo?: string | null;
    position?: number;
  }): Promise<{ link: AffiliateLink; product: Product }> {
    const product = input.product;
    const targetUrl = resolvePrimaryAffiliateTargetUrl(product.affiliateUrls);
    if (!targetUrl) {
      throw new BadRequestError(
        'Isi Shopee/TikTok/Tokopedia Shortlink terlebih dahulu sebelum posting ke Lnk.Bio'
      );
    }
    assertSafeAffiliateUrl(targetUrl);

    const scheduleFrom =
      input.scheduleFrom !== undefined
        ? input.scheduleFrom
        : (product.affiliateUrls.lnkBioScheduleFrom ?? null);
    const scheduleTo =
      input.scheduleTo !== undefined
        ? input.scheduleTo
        : (product.affiliateUrls.lnkBioScheduleTo ?? null);

    if (scheduleFrom && scheduleTo && new Date(scheduleTo) <= new Date(scheduleFrom)) {
      throw new BadRequestError('scheduleTo harus lebih lambat daripada scheduleFrom');
    }

    const existingLink = await this.options.repo.getAffiliateLinkByProductId(product.id);
    const rawLnkBioId = existingLink?.lnkBioId ?? product.affiliateUrls.lnkBioId ?? null;
    const existingLnkBioId =
      this.options.env.LNKBIO_MODE === 'real' && isMockLnkBioId(rawLnkBioId)
        ? null
        : rawLnkBioId;
    const redirectCode = (
      existingLink?.redirectCode ??
      product.triggerKeyword ??
      `P${product.biolinkNumber}`
    ).toUpperCase();

    const redirectBase = this.getPublicRedirectBaseUrl();
    const trackedUrl = buildHybridTrackedUrl({
      targetUrl,
      redirectCode,
      triggerKeyword: product.triggerKeyword,
      publicRedirectBaseUrl: redirectBase,
    });
    const fallbackDirectUrl = redirectBase
      ? buildHybridTrackedUrl({
          targetUrl,
          redirectCode,
          triggerKeyword: product.triggerKeyword,
        })
      : undefined;

    const title =
      input.overrideTitle?.trim() || `#${product.biolinkNumber} - ${product.name.slice(0, 120)}`;
    const requestedGroupId =
      input.groupId !== undefined
        ? input.groupId
        : (existingLink?.groupId ??
          product.affiliateUrls.lnkBioGroupId ??
          this.options.env.LNKBIO_GROUP_ID ??
          null);

    let supportsGroups = true;
    let resolvedGroupName: string | null = existingLink?.groupName ?? null;
    try {
      const profile = await this.options.client.getProfile();
      supportsGroups = profile.supportsGroups;
      if (requestedGroupId && supportsGroups) {
        const groups = await this.options.client.listGroups();
        const foundGroup = groups.find((g) => g.groupId === requestedGroupId);
        resolvedGroupName = foundGroup?.groupName ?? resolvedGroupName;
      }
    } catch {
      supportsGroups = true;
    }

    const effectiveGroupId = supportsGroups ? requestedGroupId : null;
    const position =
      input.position ?? existingLink?.position ?? product.affiliateUrls.lnkBioPosition ?? 0;

    const operation: LnkBioSyncOperation = existingLnkBioId ? 'EDIT' : 'ADD';
    const startedAt = Date.now();
    const requestPayload = {
      title,
      link: trackedUrl,
      image: product.kalodataSnapshot?.imageUrl ?? null,
      group_id: effectiveGroupId,
      schedule_from: scheduleFrom,
      schedule_to: scheduleTo,
      position,
    };

    try {
      const apiInput = {
        title,
        url: trackedUrl,
        ...(fallbackDirectUrl ? { fallbackDirectUrl } : {}),
        imageUrl: product.kalodataSnapshot?.imageUrl,
        ...(effectiveGroupId ? { groupId: effectiveGroupId } : {}),
        ...(scheduleFrom ? { scheduleFrom } : {}),
        ...(scheduleTo ? { scheduleTo } : {}),
        position,
      };

      const published = existingLnkBioId
        ? await this.options.client.editLink({ ...apiInput, lnkBioId: existingLnkBioId })
        : await this.options.client.publishLink(apiInput);

      const finalGroupId = published.groupDroppedFallback ? null : effectiveGroupId;
      const nowIso = new Date().toISOString();

      const savedLink = await this.options.repo.upsertAffiliateLink({
        productId: product.id,
        lnkBioId: published.lnkBioId,
        biolinkNumber: product.biolinkNumber,
        redirectCode,
        title,
        targetUrl,
        trackedUrl,
        imageUrl: product.kalodataSnapshot?.imageUrl ?? null,
        groupId: finalGroupId,
        groupName: finalGroupId ? resolvedGroupName : null,
        position,
        scheduleFrom,
        scheduleTo,
        syncStatus: 'SYNCED',
        isActive: true,
        lastSyncedAt: nowIso,
      });

      const updatedUrls: Product['affiliateUrls'] = {
        ...product.affiliateUrls,
        lnkBioId: published.lnkBioId,
        ...(finalGroupId ? { lnkBioGroupId: finalGroupId } : {}),
        ...(scheduleFrom ? { lnkBioScheduleFrom: scheduleFrom } : {}),
        ...(scheduleTo ? { lnkBioScheduleTo: scheduleTo } : {}),
        lnkBioPosition: position,
      };
      if (!finalGroupId) {
        delete updatedUrls.lnkBioGroupId;
      }
      if (!scheduleFrom) {
        delete updatedUrls.lnkBioScheduleFrom;
      }
      if (!scheduleTo) {
        delete updatedUrls.lnkBioScheduleTo;
      }

      const updatedProduct = await this.options.products.updateProduct(product.id, {
        affiliateUrls: updatedUrls,
      });

      await this.logOperation({
        productId: product.id,
        affiliateLinkId: savedLink.id,
        operation,
        status: 'SUCCESS',
        httpStatus: published.httpStatus ?? 200,
        requestPayload,
        responsePayload: {
          lnkBioId: published.lnkBioId,
          groupDroppedFallback: Boolean(published.groupDroppedFallback),
        },
        errorMessage: published.groupDroppedFallback
          ? 'Akun non-MINI: publikasi dilanjutkan tanpa group_id'
          : null,
        durationMs: Date.now() - startedAt,
      });

      return { link: savedLink, product: updatedProduct };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      await this.logOperation({
        productId: product.id,
        affiliateLinkId: existingLink?.id ?? null,
        operation,
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

  async deleteProductLink(
    productId: string
  ): Promise<{ deleted: true; productId: string }> {
    const product = await this.options.products.getProductById(productId);
    if (!product) {
      throw new NotFoundError(`Product '${productId}' not found`);
    }

    const existingLink = await this.options.repo.getAffiliateLinkByProductId(productId);
    const lnkBioId = existingLink?.lnkBioId ?? product.affiliateUrls.lnkBioId;
    if (!lnkBioId) {
      throw new BadRequestError('Produk ini belum memiliki tautan aktif di Lnk.Bio');
    }

    const startedAt = Date.now();
    try {
      const shouldSkipRemoteDelete =
        this.options.env.LNKBIO_MODE === 'real' && isMockLnkBioId(lnkBioId);
      const res = shouldSkipRemoteDelete
        ? { deleted: true, httpStatus: 200 }
        : await this.options.client.deleteLink(lnkBioId);
      const marked = await this.options.repo.markAffiliateLinkDeleted(productId);

      const nextUrls: Product['affiliateUrls'] = { ...product.affiliateUrls };
      delete nextUrls.lnkBioId;
      delete nextUrls.lnkBioPosition;
      await this.options.products.updateProduct(productId, {
        affiliateUrls: nextUrls,
      });

      await this.logOperation({
        productId,
        affiliateLinkId: marked?.id ?? existingLink?.id ?? null,
        operation: 'DELETE',
        status: 'SUCCESS',
        httpStatus: res.httpStatus ?? 200,
        requestPayload: { lnk_id: lnkBioId },
        responsePayload: { deleted: true },
        errorMessage: null,
        durationMs: Date.now() - startedAt,
      });

      return { deleted: true, productId };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      await this.logOperation({
        productId,
        affiliateLinkId: existingLink?.id ?? null,
        operation: 'DELETE',
        status: 'FAILED',
        httpStatus: null,
        requestPayload: { lnk_id: lnkBioId },
        responsePayload: null,
        errorMessage: msg,
        durationMs: Date.now() - startedAt,
      });
      throw error;
    }
  }

  async reorderProductLinks(input: {
    orderedProductIds: string[];
    groupId?: string;
  }): Promise<{ reorderedCount: number; links: AffiliateLink[] }> {
    const allLinks = await this.options.repo.listAffiliateLinks();
    const linkByProductId = new Map(allLinks.map((l) => [l.productId, l]));

    const targetLinks: AffiliateLink[] = [];
    for (const productId of input.orderedProductIds) {
      const link = linkByProductId.get(productId);
      if (link && link.isActive && link.lnkBioId) {
        targetLinks.push(link);
      }
    }

    if (targetLinks.length === 0) {
      throw new BadRequestError('Tidak ada tautan Lnk.Bio aktif untuk diurutkan ulang');
    }

    const orderedLnkBioIds = targetLinks.map((l) => l.lnkBioId!);
    const startedAt = Date.now();

    try {
      if (this.options.env.LNKBIO_MODE === 'real') {
        for (let i = 0; i < targetLinks.length; i += 1) {
          const link = targetLinks[i]!;
          const nextPos = i + 1;
          const prod = await this.options.products.getProductById(link.productId);
          if (prod && resolvePrimaryAffiliateTargetUrl(prod.affiliateUrls)) {
            await this.publishOrUpdateProductLink({
              product: prod,
              position: nextPos,
              ...(input.groupId !== undefined ? { groupId: input.groupId } : {}),
            });
          } else if (!isMockLnkBioId(link.lnkBioId)) {
            await this.options.client.editLink({
              lnkBioId: link.lnkBioId!,
              title: link.title,
              url: link.trackedUrl,
              imageUrl: link.imageUrl ?? undefined,
              groupId: input.groupId ?? link.groupId ?? undefined,
              position: nextPos,
            });
            await this.options.repo.updateAffiliateLinkClicks(link.id, {
              position: nextPos,
              lastSyncedAt: new Date().toISOString(),
            });
          }
        }
      } else {
        const res = await this.options.client.reorderLinks(
          orderedLnkBioIds,
          input.groupId
        );

        for (let i = 0; i < targetLinks.length; i += 1) {
          const link = targetLinks[i]!;
          const nextPos = i + 1;
          await this.options.repo.updateAffiliateLinkClicks(link.id, {
            position: nextPos,
            lastSyncedAt: new Date().toISOString(),
          });
          const prod = await this.options.products.getProductById(link.productId);
          if (prod) {
            await this.options.products.updateProduct(prod.id, {
              affiliateUrls: {
                ...prod.affiliateUrls,
                lnkBioPosition: nextPos,
              },
            });
          }
        }

        await this.logOperation({
          productId: null,
          affiliateLinkId: null,
          operation: 'REORDER',
          status: 'SUCCESS',
          httpStatus: res.httpStatus ?? 200,
          requestPayload: { link_ids: orderedLnkBioIds, group_id: input.groupId ?? null },
          responsePayload: { reorderedCount: targetLinks.length },
          errorMessage: null,
          durationMs: Date.now() - startedAt,
        });

        const updatedLinks = await this.options.repo.listAffiliateLinks();
        return { reorderedCount: targetLinks.length, links: updatedLinks };
      }

      await this.logOperation({
        productId: null,
        affiliateLinkId: null,
        operation: 'REORDER',
        status: 'SUCCESS',
        httpStatus: 200,
        requestPayload: { link_ids: orderedLnkBioIds, group_id: input.groupId ?? null },
        responsePayload: { reorderedCount: targetLinks.length },
        errorMessage: null,
        durationMs: Date.now() - startedAt,
      });

      const updatedLinks = await this.options.repo.listAffiliateLinks();
      return { reorderedCount: targetLinks.length, links: updatedLinks };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      await this.logOperation({
        productId: null,
        affiliateLinkId: null,
        operation: 'REORDER',
        status: 'FAILED',
        httpStatus: null,
        requestPayload: { lnks: orderedLnkBioIds },
        responsePayload: null,
        errorMessage: msg,
        durationMs: Date.now() - startedAt,
      });
      throw error;
    }
  }

  async syncRemoteLinksAndMetrics(): Promise<{
    syncedLinks: number;
    groupsCount: number;
    snapshotsCreated: number;
    profile: LnkBioAccountProfile;
  }> {
    const startedAt = Date.now();
    const profile = await this.options.client.getProfile();
    const groups = profile.supportsGroups
      ? await this.options.client.listGroups().catch(() => [])
      : [];
    const remoteLinks = await this.options.client.listLinks();
    const remoteById = new Map(remoteLinks.map((r) => [r.lnkBioId, r]));

    const [products, existingLocalLinks, weeklyReport] = await Promise.all([
      this.options.products.listProducts(),
      this.options.repo.listAffiliateLinks(),
      this.options.analytics.getLatestWeeklyEvaluation(),
    ]);
    const productById = new Map(products.map((p) => [p.id, p]));
    const weeklyByProductId = new Map(weeklyReport.items.map((w) => [w.productId, w]));

    if (this.options.env.LNKBIO_MODE === 'real') {
      for (const link of existingLocalLinks) {
        if (!link.isActive || !isMockLnkBioId(link.lnkBioId)) continue;
        const prod = productById.get(link.productId);
        if (prod && resolvePrimaryAffiliateTargetUrl(prod.affiliateUrls)) {
          await this.publishOrUpdateProductLink({ product: prod }).catch(() => undefined);
        }
      }
    }

    const localLinks =
      this.options.env.LNKBIO_MODE === 'real'
        ? await this.options.repo.listAffiliateLinks()
        : existingLocalLinks;

    const nowIso = new Date().toISOString();
    let syncedLinks = 0;
    let snapshotsCreated = 0;

    for (const link of localLinks) {
      if (!link.isActive) continue;
      const remote = link.lnkBioId ? remoteById.get(link.lnkBioId) : undefined;
      const lnkBioClicks = remote ? remote.clicks : link.lnkBioClicks;
      const position = remote ? remote.position : link.position;

      await this.options.repo.updateAffiliateLinkClicks(link.id, {
        lnkBioClicks,
        position,
        lastSyncedAt: nowIso,
      });
      syncedLinks += 1;

      const prod = productById.get(link.productId);
      const weekly = weeklyByProductId.get(link.productId);
      const totalTrackedClicks = Math.max(link.internalClicks, lnkBioClicks);
      const totalViews = weekly?.totalViews ?? 0;
      const ctrPct =
        totalViews > 0
          ? Number(((totalTrackedClicks / totalViews) * 100).toFixed(2))
          : 0;
      const estimatedCommissionIdr = weekly?.estimatedCommissionIdr ?? 0;
      const performanceScore = computeLinkPerformanceScore({
        totalTrackedClicks,
        estimatedCommissionIdr,
        commissionRatePct: prod?.commissionRatePct,
      });

      await this.options.repo.createMetricsSnapshot({
        productId: link.productId,
        affiliateLinkId: link.id,
        lnkBioId: link.lnkBioId,
        snapshotDate: nowIso,
        lnkBioClicks,
        internalRedirectClicks: link.internalClicks,
        totalTrackedClicks,
        ctrPct,
        estimatedCommissionIdr,
        performanceScore,
        utmBreakdown: {
          lnkbio: link.internalClicks,
        },
      });
      snapshotsCreated += 1;
    }

    await this.logOperation({
      productId: null,
      affiliateLinkId: null,
      operation: 'LIST_SYNC',
      status: 'SUCCESS',
      httpStatus: 200,
      requestPayload: { remoteCount: remoteLinks.length },
      responsePayload: { syncedLinks, groupsCount: groups.length, snapshotsCreated },
      errorMessage: null,
      durationMs: Date.now() - startedAt,
    });

    return {
      syncedLinks,
      groupsCount: groups.length,
      snapshotsCreated,
      profile,
    };
  }

  async recordRedirectClick(
    code: string,
    _query?: Record<string, string | undefined>
  ): Promise<{ destinationUrl: string; link: AffiliateLink }> {
    const link = await this.options.repo.getAffiliateLinkByRedirectCode(code);
    if (!link || !link.isActive) {
      throw new NotFoundError(`Redirect code '${code}' not found`);
    }

    const destinationUrl = buildRedirectDestinationUrl(link.targetUrl);
    const updated = await this.options.repo.incrementInternalClicks(link.id);
    return { destinationUrl, link: updated };
  }

  async getOverview(): Promise<LnkBioOverview> {
    let profile: LnkBioAccountProfile;
    let groups: LnkBioGroup[] = [];

    try {
      profile = await this.options.client.getProfile();
      if (profile.supportsGroups) {
        groups = await this.options.client.listGroups().catch(() => []);
      }
    } catch {
      profile = {
        accountId: 'lnkbio_disconnected',
        username: 'ebieshop',
        planTier: 'UNKNOWN',
        supportsGroups: false,
        connected: false,
        tokenStatus: 'NEEDS_REAUTH',
        expiresAt: null,
      };
    }

    let links = await this.options.repo.listAffiliateLinks();
    const [products, weeklyReport] = await Promise.all([
      this.options.products.listProducts(),
      this.options.analytics.getLatestWeeklyEvaluation(),
    ]);

    const redirectBase = this.getPublicRedirectBaseUrl();
    const existingLinkProductIds = new Set(links.map((l) => l.productId));
    let backfilled = false;
    for (const prod of products) {
      if (!prod.affiliateUrls.lnkBioId || existingLinkProductIds.has(prod.id)) {
        continue;
      }
      const targetUrl = resolvePrimaryAffiliateTargetUrl(prod.affiliateUrls);
      if (!targetUrl) continue;
      try {
        assertSafeAffiliateUrl(targetUrl);
      } catch {
        continue;
      }
      const redirectCode = prod.triggerKeyword.toUpperCase();
      const trackedUrl = buildHybridTrackedUrl({
        targetUrl,
        redirectCode,
        triggerKeyword: prod.triggerKeyword,
        publicRedirectBaseUrl: redirectBase,
      });
      await this.options.repo.upsertAffiliateLink({
        productId: prod.id,
        lnkBioId: prod.affiliateUrls.lnkBioId,
        biolinkNumber: prod.biolinkNumber,
        redirectCode,
        title: `#${prod.biolinkNumber} - ${prod.name.slice(0, 120)}`,
        targetUrl,
        trackedUrl,
        imageUrl: prod.kalodataSnapshot?.imageUrl ?? null,
        groupId: prod.affiliateUrls.lnkBioGroupId ?? null,
        groupName: null,
        position: prod.affiliateUrls.lnkBioPosition ?? 0,
        scheduleFrom: prod.affiliateUrls.lnkBioScheduleFrom ?? null,
        scheduleTo: prod.affiliateUrls.lnkBioScheduleTo ?? null,
        syncStatus: 'SYNCED',
        isActive: true,
        lastSyncedAt: prod.updatedAt,
      });
      backfilled = true;
    }

    if (redirectBase) {
      for (const link of links) {
        if (!link.isActive) continue;
        const prod = products.find((p) => p.id === link.productId);
        const updatedTrackedUrl = buildHybridTrackedUrl({
          targetUrl: link.targetUrl,
          redirectCode: link.redirectCode,
          triggerKeyword: prod?.triggerKeyword ?? link.redirectCode,
          publicRedirectBaseUrl: redirectBase,
        });
        if (link.trackedUrl === updatedTrackedUrl) continue;
        await this.options.repo.upsertAffiliateLink({
          productId: link.productId,
          lnkBioId: link.lnkBioId,
          biolinkNumber: link.biolinkNumber,
          redirectCode: link.redirectCode,
          title: link.title,
          targetUrl: link.targetUrl,
          trackedUrl: updatedTrackedUrl,
          imageUrl: link.imageUrl,
          groupId: link.groupId,
          groupName: link.groupName,
          position: link.position,
          scheduleFrom: link.scheduleFrom,
          scheduleTo: link.scheduleTo,
          syncStatus: link.syncStatus,
          isActive: link.isActive,
          lnkBioClicks: link.lnkBioClicks,
          lastSyncedAt: link.lastSyncedAt,
        });
        backfilled = true;
      }
    }

    if (backfilled) {
      links = await this.options.repo.listAffiliateLinks();
    }

    const productById = new Map(products.map((p) => [p.id, p]));
    const weeklyByProductId = new Map(weeklyReport.items.map((w) => [w.productId, w]));

    const enrichedLinks: AffiliateLink[] = links.map((link) => {
      const prod = productById.get(link.productId);
      const weekly = weeklyByProductId.get(link.productId);
      const totalClicks = Math.max(link.internalClicks, link.lnkBioClicks);
      const performanceScore = computeLinkPerformanceScore({
        totalTrackedClicks: totalClicks,
        estimatedCommissionIdr: weekly?.estimatedCommissionIdr ?? 0,
        commissionRatePct: prod?.commissionRatePct,
      });
      const readyForDelete = Boolean(
        link.isActive &&
          link.lnkBioId &&
          (prod?.status === 'PAUSED' || prod?.status === 'DROPPED')
      );
      return {
        ...link,
        ...(prod ? { productStatus: prod.status } : {}),
        readyForDelete,
        performanceScore,
      };
    });

    const activeLinks = enrichedLinks.filter((l) => l.isActive && l.lnkBioId);
    const recommendedOrder = [...activeLinks]
      .sort((a, b) => (b.performanceScore ?? 0) - (a.performanceScore ?? 0))
      .map((l) => l.productId);

    const readyToDeleteCount = enrichedLinks.filter((l) => l.readyForDelete).length;

    return {
      profile,
      groups,
      links: enrichedLinks,
      recommendedOrder,
      readyToDeleteCount,
    };
  }

  async listLogs(filter?: {
    limit?: number;
    operation?: LnkBioSyncOperation;
    status?: 'SUCCESS' | 'FAILED';
  }): Promise<LnkBioSyncLog[]> {
    return this.options.repo.listSyncLogs(filter);
  }

  async listMetrics(filter?: {
    productId?: string;
    limit?: number;
  }): Promise<LnkBioMetricsSnapshot[]> {
    return this.options.repo.listMetricsSnapshots(filter);
  }
}
