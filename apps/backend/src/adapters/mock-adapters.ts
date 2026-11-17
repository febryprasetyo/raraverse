import {
  loadMockKalodataCandidates,
  loadMockProducts,
  loadMockScriptGeneratorOutput,
  loadMockWeeklyEvaluation,
} from '@ebieshop/mocks';
import type {
  IAnalyticsRepository,
  IKalodataClient,
  ILlmProvider,
  IProductRepository,
  KalodataFilterInput,
} from './contracts.js';

export class MockKalodataClient implements IKalodataClient {
  async fetchWinningCandidates(filter: KalodataFilterInput) {
    return loadMockKalodataCandidates()
      .filter(
        (item) =>
          item.niche === filter.niche &&
          item.priceIdr <= filter.maxPriceIdr &&
          item.rating >= filter.minRating
      )
      .slice(0, filter.limit);
  }
}

export class MockLlmProvider implements ILlmProvider {
  async generateScript() {
    return loadMockScriptGeneratorOutput();
  }
}

export class MockProductRepository implements IProductRepository {
  async listProducts() {
    return loadMockProducts();
  }
}

export class MockAnalyticsRepository implements IAnalyticsRepository {
  async getLatestWeeklyEvaluation() {
    return loadMockWeeklyEvaluation();
  }
}
