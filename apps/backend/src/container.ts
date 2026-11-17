import type { EnvConfig } from './config/env.js';
import type {
  IAnalyticsRepository,
  IKalodataClient,
  ILlmProvider,
  IProductRepository,
} from './adapters/contracts.js';
import {
  MockAnalyticsRepository,
  MockKalodataClient,
  MockLlmProvider,
  MockProductRepository,
} from './adapters/mock-adapters.js';

export interface AppContainer {
  env: EnvConfig;
  kalodata: IKalodataClient;
  llm: ILlmProvider;
  products: IProductRepository;
  analytics: IAnalyticsRepository;
}

/**
 * Composition root that binds mock JSON adapters or real API/DB implementations
 * based on DATA_SOURCE_MODE and per-service environment overrides.
 */
export function createAppContainer(env: EnvConfig): AppContainer {
  if (env.KALODATA_MODE === 'real' || env.LLM_MODE === 'real' || env.DATA_SOURCE_MODE === 'real') {
    throw new Error(
      'Real API/DB adapters are scheduled for Phase 2. Keep DATA_SOURCE_MODE=mock during Phase 1.'
    );
  }

  return {
    env,
    kalodata: new MockKalodataClient(),
    llm: new MockLlmProvider(),
    products: new MockProductRepository(),
    analytics: new MockAnalyticsRepository(),
  };
}
