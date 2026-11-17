import type {
  KalodataCandidate,
  Product,
  ScriptGeneratorOutput,
  WeeklyEvaluationReport,
} from '@ebieshop/shared';

export interface KalodataFilterInput {
  niche: string;
  maxPriceIdr: number;
  minRating: number;
  limit: number;
}

export interface IKalodataClient {
  fetchWinningCandidates(filter: KalodataFilterInput): Promise<KalodataCandidate[]>;
}

export interface ILlmProvider {
  generateScript(input: {
    product: Product;
    angle: string;
  }): Promise<ScriptGeneratorOutput>;
}

export interface IProductRepository {
  listProducts(): Promise<Product[]>;
}

export interface IAnalyticsRepository {
  getLatestWeeklyEvaluation(): Promise<WeeklyEvaluationReport>;
}
