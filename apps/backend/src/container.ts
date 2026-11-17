import type { EnvConfig } from './config/env.js';
import type {
  IAnalyticsRepository,
  IContentAssetRepository,
  IKalodataClient,
  ILlmProvider,
  IProductRepository,
} from './adapters/contracts.js';
import { ScriptGeneratorService } from './adapters/llm-providers.js';
import {
  MockAnalyticsRepository,
  MockContentAssetRepository,
  MockKalodataClient,
  MockLlmProvider,
  MockProductRepository,
} from './adapters/mock-adapters.js';
import { MockStoragePresigner, type IStoragePresigner } from './services/r2-presigner.js';

export interface AppContainer {
  env: EnvConfig;
  kalodata: IKalodataClient;
  llm: ILlmProvider;
  scriptGenerator: ScriptGeneratorService;
  products: IProductRepository;
  contentAssets: IContentAssetRepository;
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
  const analytics: IAnalyticsRepository = new MockAnalyticsRepository();
  const storage: IStoragePresigner = new MockStoragePresigner();

  return {
    env,
    kalodata,
    llm,
    scriptGenerator: new ScriptGeneratorService(llm),
    products,
    contentAssets,
    analytics,
    storage,
  };
}
