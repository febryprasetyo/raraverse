CREATE TABLE "affiliate_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"lnk_bio_id" varchar(128),
	"biolink_number" varchar(16) NOT NULL,
	"redirect_code" varchar(32) NOT NULL,
	"title" varchar(255) NOT NULL,
	"target_url" text NOT NULL,
	"tracked_url" text NOT NULL,
	"image_url" text,
	"group_id" varchar(128),
	"group_name" varchar(128),
	"position" integer DEFAULT 0 NOT NULL,
	"schedule_from" timestamp with time zone,
	"schedule_to" timestamp with time zone,
	"sync_status" varchar(32) DEFAULT 'PENDING' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"internal_clicks" integer DEFAULT 0 NOT NULL,
	"lnk_bio_clicks" integer DEFAULT 0 NOT NULL,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lnk_bio_metrics_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"affiliate_link_id" uuid,
	"lnk_bio_id" varchar(128),
	"snapshot_date" timestamp with time zone NOT NULL,
	"lnk_bio_clicks" integer DEFAULT 0 NOT NULL,
	"internal_redirect_clicks" integer DEFAULT 0 NOT NULL,
	"total_tracked_clicks" integer DEFAULT 0 NOT NULL,
	"ctr_pct" numeric(6, 2) DEFAULT '0.00' NOT NULL,
	"estimated_commission_idr" integer DEFAULT 0 NOT NULL,
	"performance_score" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"utm_breakdown" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lnk_bio_sync_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid,
	"affiliate_link_id" uuid,
	"operation" varchar(32) NOT NULL,
	"status" varchar(16) NOT NULL,
	"http_status" integer,
	"request_payload" jsonb,
	"response_payload" jsonb,
	"error_message" text,
	"attempt_count" integer DEFAULT 1 NOT NULL,
	"duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "affiliate_links" ADD CONSTRAINT "affiliate_links_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lnk_bio_metrics_snapshots" ADD CONSTRAINT "lnk_bio_metrics_snapshots_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lnk_bio_metrics_snapshots" ADD CONSTRAINT "lnk_bio_metrics_snapshots_affiliate_link_id_affiliate_links_id_fk" FOREIGN KEY ("affiliate_link_id") REFERENCES "public"."affiliate_links"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lnk_bio_sync_logs" ADD CONSTRAINT "lnk_bio_sync_logs_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lnk_bio_sync_logs" ADD CONSTRAINT "lnk_bio_sync_logs_affiliate_link_id_affiliate_links_id_fk" FOREIGN KEY ("affiliate_link_id") REFERENCES "public"."affiliate_links"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "affiliate_links_product_uq" ON "affiliate_links" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "affiliate_links_redirect_code_uq" ON "affiliate_links" USING btree ("redirect_code");--> statement-breakpoint
CREATE INDEX "affiliate_links_lnkbio_id_idx" ON "affiliate_links" USING btree ("lnk_bio_id");--> statement-breakpoint
CREATE INDEX "lnk_bio_metrics_snapshots_prod_date_idx" ON "lnk_bio_metrics_snapshots" USING btree ("product_id","snapshot_date");--> statement-breakpoint
CREATE INDEX "lnk_bio_sync_logs_op_created_idx" ON "lnk_bio_sync_logs" USING btree ("operation","created_at");--> statement-breakpoint
CREATE INDEX "lnk_bio_sync_logs_product_idx" ON "lnk_bio_sync_logs" USING btree ("product_id");