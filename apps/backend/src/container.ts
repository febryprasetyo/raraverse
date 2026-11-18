import { createDbClient, decryptToken, encryptToken } from '@ebieshop/db';
import type { EnvConfig } from './config/env.js';
import { resolveTokenEncryptionKey } from './config/env.js';
import type {
  IAnalyticsRepository,
  IContentAssetRepository,
  IDmLogRepository,
  IKalodataClient,
  ILlmProvider,
  ILnkBioRepository,
  IProductRepository,
  IPublishJobRepository,
  IThreadsRepository,
} from './adapters/contracts.js';
import {
  DrizzleAnalyticsRepository,
  DrizzleContentAssetRepository,
  DrizzleDmLogRepository,
  DrizzleLnkBioRepository,
  DrizzleOAuthTokenRepository,
  DrizzleProductRepository,
  DrizzlePublishJobRepository,
  DrizzleThreadsRepository,
} from './adapters/drizzle-repositories.js';
import { KalodataHttpClient } from './adapters/kalodata-client.js';
import {
  LnkBioHttpClient,
  MockLnkBioClient,
  type ILnkBioClient,
} from './adapters/lnkbio-client.js';
import {
  GeminiLlmProvider,
  OpenAiLlmProvider,
  ScriptGeneratorService,
} from './adapters/llm-providers.js';
import {
  MetaGraphHttpClient,
  MockMetaGraphClient,
  type IMetaGraphClient,
} from './adapters/meta-graph-client.js';
import {
  MockAnalyticsRepository,
  MockContentAssetRepository,
  MockDmLogRepository,
  MockKalodataClient,
  MockLlmProvider,
  MockLnkBioRepository,
  MockOAuthTokenRepository,
  MockProductRepository,
  MockPublishJobRepository,
  MockThreadsRepository,
} from './adapters/mock-adapters.js';
import {
  MockThreadsClient,
  ThreadsHttpClient,
  type IThreadsClient,
} from './adapters/threads-client.js';
import { LnkBioAutomationService } from './services/lnkbio-automation.js';
import { ThreadsAutomationService } from './services/threads-automation.js';
import { MetaAutoDmProcessor } from './services/meta-auto-dm.js';
import {
  packEncryptedRefreshToken,
  unpackEncryptedRefreshToken,
  type IOAuthTokenRepository,
} from './services/oauth-refresh.js';
import {
  MockStoragePresigner,
  R2Presigner,
  type IStoragePresigner,
} from './services/r2-presigner.js';
import { TelegramAlertService } from './services/telegram-alert.js';

export interface AppContainer {
  env: EnvConfig;
  kalodata: IKalodataClient;
  lnkBio: ILnkBioClient;
  lnkBioRepo: ILnkBioRepository;
  lnkBioAutomation: LnkBioAutomationService;
  threadsClient: IThreadsClient;
  threadsRepo: IThreadsRepository;
  threadsAutomation: ThreadsAutomationService;
  llm: ILlmProvider;
  scriptGenerator: ScriptGeneratorService;
  products: IProductRepository;
  contentAssets: IContentAssetRepository;
  publishJobs: IPublishJobRepository;
  dmLogs: IDmLogRepository;
  oauthTokens?: IOAuthTokenRepository;
  metaClient: IMetaGraphClient;
  metaAutoDm: MetaAutoDmProcessor;
  analytics: IAnalyticsRepository;
  storage: IStoragePresigner;
  telegramAlerts: TelegramAlertService;
  close: () => Promise<void>;
}

/**
 * Composition root that binds mock JSON adapters or real API/DB implementations
 * based on DATA_SOURCE_MODE and per-service environment overrides.
 */
export function createAppContainer(env: EnvConfig): AppContainer {
  const kalodata: IKalodataClient =
    env.KALODATA_MODE === 'real'
      ? new KalodataHttpClient({
          apiKey: env.KALODATA_API_KEY ?? '',
          baseUrl: env.KALODATA_BASE_URL,
        })
      : new MockKalodataClient();

  let llm: ILlmProvider;
  if (env.LLM_MODE === 'real') {
    if (env.GEMINI_API_KEY) {
      llm = new GeminiLlmProvider({ apiKey: env.GEMINI_API_KEY });
    } else if (env.OPENAI_API_KEY) {
      llm = new OpenAiLlmProvider({ apiKey: env.OPENAI_API_KEY });
    } else {
      throw new Error('LLM_MODE=real requires GEMINI_API_KEY or OPENAI_API_KEY');
    }
  } else {
    llm = new MockLlmProvider();
  }

  const metaClient: IMetaGraphClient =
    env.META_API_MODE === 'real'
      ? new MetaGraphHttpClient({
          accessToken: env.META_PAGE_ACCESS_TOKEN ?? '',
        })
      : new MockMetaGraphClient();

  let products: IProductRepository;
  let contentAssets: IContentAssetRepository;
  let publishJobs: IPublishJobRepository;
  let dmLogs: IDmLogRepository;
  let lnkBioRepo: ILnkBioRepository;
  let threadsRepo: IThreadsRepository;
  let oauthTokens: IOAuthTokenRepository | undefined;
  let analytics: IAnalyticsRepository;
  let storage: IStoragePresigner;
  let close = async () => {};

  if (env.DATA_SOURCE_MODE === 'real') {
    const { db, sql } = createDbClient(env.DATABASE_URL);
    products = new DrizzleProductRepository(db);
    contentAssets = new DrizzleContentAssetRepository(db);
    publishJobs = new DrizzlePublishJobRepository(db);
    dmLogs = new DrizzleDmLogRepository(db);
    lnkBioRepo = new DrizzleLnkBioRepository(db);
    threadsRepo = new DrizzleThreadsRepository(db);
    oauthTokens = new DrizzleOAuthTokenRepository(db);
    analytics = new DrizzleAnalyticsRepository(db);
    storage =
      env.R2_ENDPOINT &&
      env.R2_BUCKET &&
      env.R2_ACCESS_KEY_ID &&
      env.R2_SECRET_ACCESS_KEY &&
      env.R2_PUBLIC_BASE_URL
        ? new R2Presigner({
            endpoint: env.R2_ENDPOINT,
            bucket: env.R2_BUCKET,
            accessKeyId: env.R2_ACCESS_KEY_ID,
            secretAccessKey: env.R2_SECRET_ACCESS_KEY,
            publicBaseUrl: env.R2_PUBLIC_BASE_URL,
          })
        : new MockStoragePresigner();
    close = async () => {
      await sql.end();
    };
  } else {
    products = new MockProductRepository();
    contentAssets = new MockContentAssetRepository();
    publishJobs = new MockPublishJobRepository();
    dmLogs = new MockDmLogRepository();
    lnkBioRepo = new MockLnkBioRepository();
    threadsRepo = new MockThreadsRepository();
    oauthTokens = new MockOAuthTokenRepository();
    analytics = new MockAnalyticsRepository();
    storage = new MockStoragePresigner();
  }

  const encKeyHex = resolveTokenEncryptionKey(env);
  const useLiveLnkBio =
    env.LNKBIO_MODE === 'real' ||
    Boolean(env.LNKBIO_ACCESS_TOKEN) ||
    (env.DATA_SOURCE_MODE === 'real' &&
      Boolean(env.LNKBIO_CLIENT_ID && env.LNKBIO_CLIENT_SECRET));

  const lnkBio: ILnkBioClient = useLiveLnkBio
    ? new LnkBioHttpClient({
        accessToken: env.LNKBIO_ACCESS_TOKEN,
        clientId: env.LNKBIO_CLIENT_ID,
        clientSecret: env.LNKBIO_CLIENT_SECRET,
        resolveToken: async () => {
          if (!oauthTokens?.getTokenByProvider || !encKeyHex) return null;
          const record = await oauthTokens.getTokenByProvider('lnkbio');
          if (!record || record.needsReauth) return null;
          const accessToken = decryptToken(
            {
              ciphertext: record.encryptedAccessToken,
              iv: record.tokenIv,
              authTag: record.tokenAuthTag,
            },
            encKeyHex
          );
          const refreshToken = record.encryptedRefreshToken
            ? unpackEncryptedRefreshToken(
                record.encryptedRefreshToken,
                record.tokenIv,
                record.tokenAuthTag,
                encKeyHex
              )
            : undefined;
          return { accessToken, refreshToken };
        },
        onTokenRefreshed: async (tok) => {
          if (!oauthTokens?.upsertToken || !encKeyHex) return;
          const encAccess = encryptToken(tok.accessToken, encKeyHex);
          const encRefresh = tok.refreshToken
            ? packEncryptedRefreshToken(tok.refreshToken, encKeyHex)
            : null;
          await oauthTokens.upsertToken({
            provider: 'lnkbio',
            accountLabel: 'ebieshop',
            externalAccountId: env.LNKBIO_CLIENT_ID ?? 'lnkbio_default',
            encryptedAccessToken: encAccess.ciphertext,
            encryptedRefreshToken: encRefresh,
            tokenIv: encAccess.iv,
            tokenAuthTag: encAccess.authTag,
            scopes: 'lnk.read,lnk.write',
            expiresAt: new Date(Date.now() + tok.expiresInSec * 1000),
            needsReauth: false,
          });
        },
      })
    : new MockLnkBioClient();

  const lnkBioAutomation = new LnkBioAutomationService({
    env,
    client: lnkBio,
    repo: lnkBioRepo,
    products,
    analytics,
    oauthTokens,
  });

  const useLiveThreads =
    env.THREADS_MODE === 'real' ||
    Boolean(env.THREADS_ACCESS_TOKEN) ||
    (env.DATA_SOURCE_MODE === 'real' &&
      Boolean(env.THREADS_APP_ID && env.THREADS_APP_SECRET));

  const threadsClient: IThreadsClient = useLiveThreads
    ? new ThreadsHttpClient({
        appId: env.THREADS_APP_ID,
        appSecret: env.THREADS_APP_SECRET,
        displayName: env.THREADS_DISPLAY_NAME,
        userId: env.THREADS_USER_ID,
        userAccessToken: env.THREADS_ACCESS_TOKEN,
        resolveUserToken: async () => {
          if (!oauthTokens?.getTokenByProvider || !encKeyHex) return null;
          const record = await oauthTokens.getTokenByProvider('threads');
          if (!record || record.needsReauth) return null;
          const accessToken = decryptToken(
            {
              ciphertext: record.encryptedAccessToken,
              iv: record.tokenIv,
              authTag: record.tokenAuthTag,
            },
            encKeyHex
          );
          return { accessToken, userId: record.externalAccountId };
        },
      })
    : new MockThreadsClient();

  const threadsAutomation = new ThreadsAutomationService({
    env,
    client: threadsClient,
    repo: threadsRepo,
    products,
    llm,
    oauthTokens,
  });

  const ownAccountIds = [env.META_OWN_IG_USER_ID, env.META_OWN_PAGE_ID].filter(
    (id): id is string => Boolean(id)
  );
  const metaAutoDm = new MetaAutoDmProcessor({
    products,
    dmLogs,
    metaClient,
    ownAccountIds,
    igUserId: env.META_OWN_IG_USER_ID,
  });

  const telegramAlerts = new TelegramAlertService({
    botToken: env.TELEGRAM_BOT_TOKEN,
    chatId: env.TELEGRAM_ADMIN_CHAT_ID,
  });

  return {
    env,
    kalodata,
    lnkBio,
    lnkBioRepo,
    lnkBioAutomation,
    threadsClient,
    threadsRepo,
    threadsAutomation,
    llm,
    scriptGenerator: new ScriptGeneratorService(llm),
    products,
    contentAssets,
    publishJobs,
    dmLogs,
    oauthTokens,
    metaClient,
    metaAutoDm,
    analytics,
    storage,
    telegramAlerts,
    close,
  };
}
