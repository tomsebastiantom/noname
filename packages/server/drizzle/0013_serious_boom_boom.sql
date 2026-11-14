CREATE TABLE "schedule_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text DEFAULT 'running' NOT NULL,
	"items" integer,
	"dry_run" text DEFAULT 'true' NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "schedule_state" (
	"name" text PRIMARY KEY NOT NULL,
	"pattern" text,
	"paused" text DEFAULT 'false' NOT NULL,
	"dry_run" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
CREATE INDEX "schedule_runs_name_started_idx" ON "schedule_runs" USING btree ("name","started_at");