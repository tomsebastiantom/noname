CREATE TABLE "machine_definition_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"version" integer NOT NULL,
	"definition" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "machine_definitions" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "machine_instances" ADD COLUMN "definition_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "machine_definition_versions_org_name_version" ON "machine_definition_versions" USING btree ("org_id","name","version");--> statement-breakpoint
-- Backfill: definitions that predate versioning become version 1, so existing instances (pinned to the
-- default definition_version=1) resolve to the definition they started under.
INSERT INTO "machine_definition_versions" ("id", "org_id", "name", "version", "definition")
SELECT gen_random_uuid(), "org_id", "name", "version", "definition" FROM "machine_definitions"
ON CONFLICT ("org_id", "name", "version") DO NOTHING;
