CREATE TABLE "schedule_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schedule_id" uuid,
	"definition" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text DEFAULT 'running' NOT NULL,
	"items" integer,
	"dry_run" text DEFAULT 'true' NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"definition" text NOT NULL,
	"label" text,
	"pattern" text NOT NULL,
	"paused" text DEFAULT 'false' NOT NULL,
	"dry_run" text DEFAULT 'true' NOT NULL,
	"is_default" text DEFAULT 'false' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text
);
--> statement-breakpoint
CREATE INDEX "schedule_runs_definition_started_idx" ON "schedule_runs" USING btree ("definition","started_at");--> statement-breakpoint
CREATE INDEX "schedules_definition_idx" ON "schedules" USING btree ("definition");