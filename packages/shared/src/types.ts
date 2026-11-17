import { z } from 'zod';
import {
  AffiliateUrlsSchema,
  ContentAssetSchema,
  ContentStatusSchema,
  DataSourceModeSchema,
  DmLogSchema,
  DmStatusSchema,
  ExecutionModeSchema,
  KalodataCandidateSchema,
  KalodataSnapshotSchema,
  LocalVideoRenderJobSchema,
  MetaWebhookPayloadSchema,
  ProductSchema,
  ProductStatusSchema,
  PublishJobPayloadSchema,
  PublishJobRecordSchema,
  PublishStatusSchema,
  ScriptGeneratorOutputSchema,
  TargetPlatformSchema,
  WeeklyEvaluationReportSchema,
  WeeklyRecommendationSchema,
} from './schemas.js';

export type ProductStatus = z.infer<typeof ProductStatusSchema>;
export type ContentStatus = z.infer<typeof ContentStatusSchema>;
export type TargetPlatform = z.infer<typeof TargetPlatformSchema>;
export type ExecutionMode = z.infer<typeof ExecutionModeSchema>;
export type PublishStatus = z.infer<typeof PublishStatusSchema>;
export type DmStatus = z.infer<typeof DmStatusSchema>;
export type DataSourceMode = z.infer<typeof DataSourceModeSchema>;

export type AffiliateUrls = z.infer<typeof AffiliateUrlsSchema>;
export type KalodataSnapshot = z.infer<typeof KalodataSnapshotSchema>;
export type KalodataCandidate = z.infer<typeof KalodataCandidateSchema>;
export type Product = z.infer<typeof ProductSchema>;
export type ScriptGeneratorOutput = z.infer<typeof ScriptGeneratorOutputSchema>;
export type ContentAsset = z.infer<typeof ContentAssetSchema>;
export type PublishJobRecord = z.infer<typeof PublishJobRecordSchema>;
export type LocalVideoRenderJob = z.infer<typeof LocalVideoRenderJobSchema>;
export type PublishJobPayload = z.infer<typeof PublishJobPayloadSchema>;
export type MetaWebhookPayload = z.infer<typeof MetaWebhookPayloadSchema>;
export type DmLog = z.infer<typeof DmLogSchema>;
export type WeeklyRecommendation = z.infer<typeof WeeklyRecommendationSchema>;
export type WeeklyEvaluationReport = z.infer<typeof WeeklyEvaluationReportSchema>;
