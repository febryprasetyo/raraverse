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
import { ScriptGeneratorService } from './adapters/llm-providers.js';
import { MockMetaGraphClient, type IMetaGraphClient } from './adapters/meta-graph-client.js';
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
import { MockStoragePresigner, type IStoragePresigner } from './services/r2-presigner.js';

export interface AppContainer {
  env: EnvConfig;
  kalodata: IKalodataClient;
  llm: ILlmProvider;
  scriptGenerator: ScriptGeneratorService;
  products: IProductRepository;
  contentAssets: IContentAssetRepository;
  publishJobs: IPublishJobRepository;
  dmLogs: IDmLogRepository;
  metaClient: IMetaGraphClient;
  metaAutoDm: MetaAutoDmProcessor;
  analytics: IAnalyticsRepository;
  storage: IStoragePresigner;
}

/**
 * Composition root that binds mock JSON adapters or real API/DB implementations
 * based on DATA_SOURCE_MODE and per-service environment overrides.
 */
export function createAppContainer(env: EnvConfig): AppContainer {
  const kalodata: IKalodataClient = new MockKalodataClient();
  const llm: ILlmProvider = new MockLlmProvider();
  const products: IProductRepository = new MockProductRepository();
  const contentAssets: IContentAssetRepository = new MockContentAssetRepository();
  const publishJobs: IPublishJobRepository = new MockPublishJobRepository();
  const dmLogs: IDmLogRepository = new MockDmLogRepository();
  const metaClient: IMetaGraphClient = new MockMetaGraphClient();
  const analytics: IAnalyticsRepository = new MockAnalyticsRepository();
  const storage: IStoragePresigner = new MockStoragePresigner();
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

  return {
    env,
    kalodata,
    llm,
    scriptGenerator: new ScriptGeneratorService(llm),
    products,
    contentAssets,
    publishJobs,
    dmLogs,
    metaClient,
    metaAutoDm,
    analytics,
    storage,
  };
}
