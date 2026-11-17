CREATE TYPE "public"."content_status" AS ENUM('GENERATING_SCRIPT', 'RENDERING_VIDEO', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."dm_status" AS ENUM('PENDING', 'SENT', 'FAILED', 'SKIPPED_NO_KEYWORD');--> statement-breakpoint
CREATE TYPE "public"."execution_mode" AS ENUM('OFFICIAL_API', 'PLAYWRIGHT_LOCAL');--> statement-breakpoint
CREATE TYPE "public"."target_platform" AS ENUM('IG_REELS', 'FB_REELS', 'YT_SHORTS', 'SHOPEE_VIDEO', 'TIKTOK_STUDIO');--> statement-breakpoint
CREATE TYPE "public"."product_status" AS ENUM('CANDIDATE', 'CURATED', 'ACTIVE', 'PAUSED', 'DROPPED');--> statement-breakpoint
CREATE TYPE "public"."publish_status" AS ENUM('QUEUED', 'PROCESSING', 'PUBLISHED', 'FAILED', 'NEEDS_MANUAL_LOGIN', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "content_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"llm_provider" varchar(64) NOT NULL,
	"tts_provider" varchar(64) NOT NULL,
	"tts_voice_id" varchar(64) NOT NULL,
	"script_json" jsonb NOT NULL,
	"audio_r2_key" varchar(512),
	"subtitle_r2_key" varchar(512),
	"video_r2_key" varchar(512),
	"video_sha256" varchar(64),
	"duration_sec" numeric(6, 2),
	"resolution" varchar(16) DEFAULT '1080x1920' NOT NULL,
	"status" "content_status" DEFAULT 'GENERATING_SCRIPT' NOT NULL,
	"rejection_reason" text,
	"approved_by" varchar(128),
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dm_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid,
	"platform" varchar(32) NOT NULL,
	"media_id" varchar(128) NOT NULL,
	"comment_id" varchar(128) NOT NULL,
	"sender_id" varchar(128) NOT NULL,
	"sender_username" varchar(128),
	"comment_text" text NOT NULL,
	"matched_keyword" varchar(32),
	"public_reply_text" text,
	"public_reply_sent" boolean DEFAULT false NOT NULL,
	"dm_sent" boolean DEFAULT false NOT NULL,
	"sent_shortlink" text,
	"status" "dm_status" DEFAULT 'PENDING' NOT NULL,
	"error_message" text,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" varchar(32) NOT NULL,
	"account_label" varchar(128) NOT NULL,
	"external_account_id" varchar(128) NOT NULL,
	"encrypted_access_token" text NOT NULL,
	"encrypted_refresh_token" text,
	"token_iv" varchar(64) NOT NULL,
	"token_auth_tag" varchar(64) NOT NULL,
	"scopes" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_refreshed_at" timestamp with time zone,
	"needs_reauth" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_metrics_weekly" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"week_start_date" timestamp with time zone NOT NULL,
	"videos_published" integer DEFAULT 0 NOT NULL,
	"total_views" integer DEFAULT 0 NOT NULL,
	"total_trigger_comments" integer DEFAULT 0 NOT NULL,
	"total_dm_sent" integer DEFAULT 0 NOT NULL,
	"estimated_clicks" integer DEFAULT 0 NOT NULL,
	"estimated_commission_idr" integer DEFAULT 0 NOT NULL,
	"recommendation" varchar(32) NOT NULL,
	"operator_decision" varchar(32),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kalodata_product_id" varchar(128),
	"niche" varchar(100) NOT NULL,
	"name" varchar(255) NOT NULL,
	"price_idr" integer NOT NULL,
	"rating" numeric(3, 2) DEFAULT '0.00' NOT NULL,
	"commission_rate_pct" numeric(5, 2) DEFAULT '0.00' NOT NULL,
	"is_commission_xtra" boolean DEFAULT false NOT NULL,
	"is_official_store" boolean DEFAULT false NOT NULL,
	"biolink_number" varchar(16) NOT NULL,
	"trigger_keyword" varchar(32) NOT NULL,
	"affiliate_urls" jsonb NOT NULL,
	"kalodata_snapshot" jsonb,
	"raw_media_dir" varchar(512) NOT NULL,
	"raw_media_clip_count" integer DEFAULT 0 NOT NULL,
	"status" "product_status" DEFAULT 'CANDIDATE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publish_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_asset_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"platform" "target_platform" NOT NULL,
	"execution_mode" "execution_mode" NOT NULL,
	"visibility" varchar(32) DEFAULT 'PUBLIC' NOT NULL,
	"bullmq_job_id" varchar(128),
	"scheduled_at" timestamp with time zone NOT NULL,
	"published_at" timestamp with time zone,
	"platform_post_id" varchar(255),
	"platform_post_url" text,
	"status" "publish_status" DEFAULT 'QUEUED' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_assets" ADD CONSTRAINT "content_assets_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dm_logs" ADD CONSTRAINT "dm_logs_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_metrics_weekly" ADD CONSTRAINT "product_metrics_weekly_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publish_jobs" ADD CONSTRAINT "publish_jobs_content_asset_id_content_assets_id_fk" FOREIGN KEY ("content_asset_id") REFERENCES "public"."content_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publish_jobs" ADD CONSTRAINT "publish_jobs_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "content_assets_product_idx" ON "content_assets" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "content_assets_status_idx" ON "content_assets" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "content_assets_video_sha256_uq" ON "content_assets" USING btree ("video_sha256");--> statement-breakpoint
CREATE UNIQUE INDEX "dm_logs_comment_id_uq" ON "dm_logs" USING btree ("comment_id");--> statement-breakpoint
CREATE INDEX "dm_logs_keyword_created_idx" ON "dm_logs" USING btree ("matched_keyword","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_tokens_provider_account_uq" ON "oauth_tokens" USING btree ("provider","external_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_metrics_weekly_prod_week_uq" ON "product_metrics_weekly" USING btree ("product_id","week_start_date");--> statement-breakpoint
CREATE UNIQUE INDEX "products_trigger_keyword_uq" ON "products" USING btree ("trigger_keyword");--> statement-breakpoint
CREATE UNIQUE INDEX "products_biolink_number_uq" ON "products" USING btree ("biolink_number");--> statement-breakpoint
CREATE UNIQUE INDEX "products_kalodata_id_uq" ON "products" USING btree ("kalodata_product_id");--> statement-breakpoint
CREATE INDEX "products_status_idx" ON "products" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "publish_jobs_asset_platform_uq" ON "publish_jobs" USING btree ("content_asset_id","platform");--> statement-breakpoint
CREATE INDEX "publish_jobs_status_schedule_idx" ON "publish_jobs" USING btree ("status","scheduled_at");--> statement-breakpoint
CREATE INDEX "publish_jobs_platform_post_idx" ON "publish_jobs" USING btree ("platform_post_id");