import type {
  AffiliateUrls,
  ContentAsset,
  ContentStatus,
  DmLog,
  DmStatus,
  ExecutionMode,
  KalodataCandidate,
  KalodataSnapshot,
  Product,
  ProductStatus,
  PublishJobRecord,
  PublishStatus,
  ScriptGeneratorOutput,
  TargetPlatform,
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
  readonly providerName?: string;
  generateScript(input: {
    product: Product;
    angle: string;
  }): Promise<ScriptGeneratorOutput>;
}

export interface CreateProductInput {
  kalodataProductId?: string | null;
  niche: string;
  name: string;
  priceIdr: number;
  rating: number;
  commissionRatePct: number;
  isCommissionXtra: boolean;
  isOfficialStore: boolean;
  biolinkNumber: string;
  triggerKeyword: string;
  affiliateUrls: AffiliateUrls;
  kalodataSnapshot?: KalodataSnapshot | null;
  rawMediaDir: string;
  rawMediaClipCount: number;
  status?: ProductStatus;
}

export interface UpdateProductInput {
  name?: string;
  priceIdr?: number;
  rating?: number;
  commissionRatePct?: number;
  isCommissionXtra?: boolean;
  isOfficialStore?: boolean;
  biolinkNumber?: string;
  triggerKeyword?: string;
  affiliateUrls?: AffiliateUrls;
  rawMediaDir?: string;
  rawMediaClipCount?: number;
  status?: ProductStatus;
}

export interface IProductRepository {
  listProducts(filter?: { status?: ProductStatus }): Promise<Product[]>;
  getProductById(id: string): Promise<Product | null>;
  findByTriggerKeyword(keyword: string): Promise<Product | null>;
  findByKalodataId(kalodataProductId: string): Promise<Product | null>;
  createProduct(input: CreateProductInput): Promise<Product>;
  updateProduct(id: string, patch: UpdateProductInput): Promise<Product>;
}

export interface CreateContentAssetInput {
  productId: string;
  llmProvider: string;
  ttsProvider: 'edge-tts' | 'elevenlabs';
  ttsVoiceId: string;
  scriptJson: ScriptGeneratorOutput;
  status?: ContentStatus;
}

export interface UpdateContentAssetInput {
  audioR2Key?: string | null;
  subtitleR2Key?: string | null;
  videoR2Key?: string | null;
  videoSha256?: string | null;
  durationSec?: number | null;
  status?: ContentStatus;
  rejectionReason?: string | null;
}

export interface IContentAssetRepository {
  listContentAssets(filter?: { status?: ContentStatus }): Promise<ContentAsset[]>;
  getContentAssetById(id: string): Promise<ContentAsset | null>;
  createContentAsset(input: CreateContentAssetInput): Promise<ContentAsset>;
  updateContentAsset(id: string, patch: UpdateContentAssetInput): Promise<ContentAsset>;
}

export interface CreateDmLogInput {
  productId: string | null;
  platform: 'IG_REELS' | 'FB_REELS';
  mediaId: string;
  commentId: string;
  senderId: string;
  senderUsername: string | null;
  commentText: string;
  matchedKeyword: string | null;
  publicReplySent: boolean;
  dmSent: boolean;
  status: DmStatus;
}

export interface IDmLogRepository {
  listDmLogs(): Promise<DmLog[]>;
  findByCommentId(commentId: string): Promise<DmLog | null>;
  createDmLog(input: CreateDmLogInput): Promise<DmLog>;
}

export interface CreatePublishJobInput {
  contentAssetId: string;
  productId: string;
  platform: TargetPlatform;
  executionMode: ExecutionMode;
  visibility?: 'PUBLIC' | 'PRIVATE';
  scheduledAt: string;
}

export interface UpdatePublishJobInput {
  status?: PublishStatus;
  publishedAt?: string | null;
  platformPostId?: string | null;
  attemptCount?: number;
  lastError?: string | null;
}

export interface IPublishJobRepository {
  listPublishJobs(): Promise<PublishJobRecord[]>;
  getPublishJobById(id: string): Promise<PublishJobRecord | null>;
  createPublishJob(input: CreatePublishJobInput): Promise<PublishJobRecord>;
  updatePublishJob(id: string, patch: UpdatePublishJobInput): Promise<PublishJobRecord>;
}

export interface IAnalyticsRepository {
  getLatestWeeklyEvaluation(): Promise<WeeklyEvaluationReport>;
}
