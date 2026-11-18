ALTER TYPE "public"."target_platform" ADD VALUE 'THREADS';--> statement-breakpoint
CREATE TABLE "threads_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"root_post_id" varchar(128),
	"reply_post_id" varchar(128),
	"permalink" text,
	"username" varchar(128) NOT NULL,
	"media_type" varchar(16) DEFAULT 'TEXT' NOT NULL,
	"root_text" text NOT NULL,
	"reply_text" text NOT NULL,
	"media_url" text,
	"affiliate_url" text NOT NULL,
	"status" varchar(32) DEFAULT 'PUBLISHED' NOT NULL,
	"views_count" integer DEFAULT 0 NOT NULL,
	"likes_count" integer DEFAULT 0 NOT NULL,
	"replies_count" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "threads_sync_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid,
	"threads_post_id" uuid,
	"operation" varchar(32) NOT NULL,
	"status" varchar(16) NOT NULL,
	"http_status" integer,
	"request_payload" jsonb,
	"response_payload" jsonb,
	"error_message" text,
	"duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "threads_posts" ADD CONSTRAINT "threads_posts_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads_sync_logs" ADD CONSTRAINT "threads_sync_logs_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads_sync_logs" ADD CONSTRAINT "threads_sync_logs_threads_post_id_threads_posts_id_fk" FOREIGN KEY ("threads_post_id") REFERENCES "public"."threads_posts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "threads_posts_product_idx" ON "threads_posts" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "threads_posts_root_post_idx" ON "threads_posts" USING btree ("root_post_id");--> statement-breakpoint
CREATE INDEX "threads_posts_status_idx" ON "threads_posts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "threads_sync_logs_op_created_idx" ON "threads_sync_logs" USING btree ("operation","created_at");--> statement-breakpoint
CREATE INDEX "threads_sync_logs_product_idx" ON "threads_sync_logs" USING btree ("product_id");