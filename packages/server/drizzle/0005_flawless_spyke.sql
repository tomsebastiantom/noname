CREATE TABLE "release_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"channel" text NOT NULL,
	"release_id" uuid NOT NULL,
	"previous_release_id" uuid,
	"updated_by" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenant_release_pointers" ADD COLUMN "channel" text;--> statement-breakpoint
ALTER TABLE "release_channels" ADD CONSTRAINT "release_channels_release_id_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."releases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_channels" ADD CONSTRAINT "release_channels_previous_release_id_releases_id_fk" FOREIGN KEY ("previous_release_id") REFERENCES "public"."releases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "release_channels_org_channel" ON "release_channels" USING btree ("org_id","channel");