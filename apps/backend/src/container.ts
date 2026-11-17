import { createDbClient } from '@ebieshop/db';
import type { EnvConfig } from './config/env.js';
import type {
  IAnalyticsRepository,
  IContentAssetRepository,
  IDmLogRepository,
  IKalodataClient,
  ILlmProvider,
  IProductRepository,
  IPublishJobRepository,
} from './adapters/contracts.js';
import {
  DrizzleAnalyticsRepository,
  DrizzleContentAssetRepository,
  DrizzleDmLogRepository,
  DrizzleOAuthTokenRepository,
  DrizzleProductRepository,
  DrizzlePublishJobRepository,
} from './adapters/drizzle-repositories.js';
import { KalodataHttpClient } from './adapters/kalodata-client.js';
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
  MockProductRepository,
  MockPublishJobRepository,
} from './adapters/mock-adapters.js';
import { MetaAutoDmProcessor } from './services/meta-auto-dm.js';
import type { IOAuthTokenRepository } from './services/oauth-refresh.js';
import {
  MockStoragePresigner,
  R2Presigner,
  type IStoragePresigner,
} from './services/r2-presigner.js';
import { TelegramAlertService } from './services/telegram-alert.js';

export interface AppContainer {
  env: EnvConfig;
  kalodata: IKalodataClient;
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
    analytics = new MockAnalyticsRepository();
    storage = new MockStoragePresigner();
  }

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
