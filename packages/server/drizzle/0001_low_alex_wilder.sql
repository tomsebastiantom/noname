CREATE TYPE "public"."release_artifact_kind" AS ENUM('client_bundle', 'server_image', 'worker_image', 'migration_set', 'config');--> statement-breakpoint
CREATE TYPE "public"."release_state" AS ENUM('building', 'ready', 'retired');--> statement-breakpoint
CREATE TABLE "release_artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"release_id" uuid NOT NULL,
	"kind" "release_artifact_kind" NOT NULL,
	"ref" text NOT NULL,
	"digest" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "releases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"platform_version" text NOT NULL,
	"checks_version" text NOT NULL,
	"state" "release_state" DEFAULT 'building' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "release_artifacts" ADD CONSTRAINT "release_artifacts_release_id_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."releases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "release_artifacts_release_kind" ON "release_artifacts" USING btree ("release_id","kind");--> statement-breakpoint
CREATE INDEX "releases_org_state" ON "releases" USING btree ("org_id","state");--> statement-breakpoint
CREATE INDEX "releases_org_created" ON "releases" USING btree ("org_id","created_at");