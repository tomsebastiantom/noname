CREATE TABLE "tenant_release_pointers" (
	"org_id" text PRIMARY KEY NOT NULL,
	"release_id" uuid NOT NULL,
	"previous_release_id" uuid,
	"updated_by" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenant_release_pointers" ADD CONSTRAINT "tenant_release_pointers_release_id_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."releases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_release_pointers" ADD CONSTRAINT "tenant_release_pointers_previous_release_id_releases_id_fk" FOREIGN KEY ("previous_release_id") REFERENCES "public"."releases"("id") ON DELETE no action ON UPDATE no action;