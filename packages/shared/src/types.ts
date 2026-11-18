import { z } from 'zod';
import {
  AffiliateLinkSchema,
  AffiliateUrlsSchema,
  ContentAssetSchema,
  ContentStatusSchema,
  DataSourceModeSchema,
  DmLogSchema,
  DmStatusSchema,
  ExecutionModeSchema,
  KalodataCandidateSchema,
  KalodataCategorySchema,
  KalodataSnapshotSchema,
  KalodataVideoDetailSchema,
  LnkBioAccountProfileSchema,
  LnkBioGroupSchema,
  LnkBioMetricsSnapshotSchema,
  LnkBioOverviewSchema,
  LnkBioSyncLogSchema,
  LnkBioSyncOperationSchema,
  LnkBioSyncStatusSchema,
  LocalVideoRenderJobSchema,
  MetaWebhookPayloadSchema,
  ProductSchema,
  ProductStatusSchema,
  PublishJobPayloadSchema,
  PublishJobRecordSchema,
  PublishStatusSchema,
  ScriptGeneratorOutputSchema,
  TargetPlatformSchema,
  ThreadsAccountProfileSchema,
  ThreadsMediaTypeSchema,
  ThreadsOverviewSchema,
  ThreadsPostRecordSchema,
  ThreadsPostStatusSchema,
  ThreadsSyncLogSchema,
  ThreadsSyncOperationSchema,
  ThreadsTokenTypeSchema,
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
export type KalodataCategory = z.infer<typeof KalodataCategorySchema>;
export type KalodataVideoDetail = z.infer<typeof KalodataVideoDetailSchema>;
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
export type LnkBioSyncOperation = z.infer<typeof LnkBioSyncOperationSchema>;
export type LnkBioSyncStatus = z.infer<typeof LnkBioSyncStatusSchema>;
export type LnkBioGroup = z.infer<typeof LnkBioGroupSchema>;
export type LnkBioAccountProfile = z.infer<typeof LnkBioAccountProfileSchema>;
export type AffiliateLink = z.infer<typeof AffiliateLinkSchema>;
export type LnkBioSyncLog = z.infer<typeof LnkBioSyncLogSchema>;
export type LnkBioMetricsSnapshot = z.infer<typeof LnkBioMetricsSnapshotSchema>;
export type LnkBioOverview = z.infer<typeof LnkBioOverviewSchema>;
export type ThreadsMediaType = z.infer<typeof ThreadsMediaTypeSchema>;
export type ThreadsPostStatus = z.infer<typeof ThreadsPostStatusSchema>;
export type ThreadsSyncOperation = z.infer<typeof ThreadsSyncOperationSchema>;
export type ThreadsTokenType = z.infer<typeof ThreadsTokenTypeSchema>;
export type ThreadsAccountProfile = z.infer<typeof ThreadsAccountProfileSchema>;
export type ThreadsPostRecord = z.infer<typeof ThreadsPostRecordSchema>;
export type ThreadsSyncLog = z.infer<typeof ThreadsSyncLogSchema>;
export type ThreadsOverview = z.infer<typeof ThreadsOverviewSchema>;
