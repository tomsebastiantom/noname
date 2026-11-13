CREATE TABLE "tenant_directory" (
	"org_id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"plan" text,
	"region" text,
	"excluded_reason" text,
	"is_platform" text DEFAULT 'false' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_directory_slug_uq" ON "tenant_directory" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "tenant_directory_status_idx" ON "tenant_directory" USING btree ("status");