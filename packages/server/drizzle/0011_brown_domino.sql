CREATE TABLE "tenant_provisioning" (
	"org_id" text PRIMARY KEY NOT NULL,
	"idempotency_key" text NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"steps" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"requested_by" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "tenant_directory" ADD COLUMN "provisioning_state" text DEFAULT 'ready' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_provisioning_idempotency_uq" ON "tenant_provisioning" USING btree ("idempotency_key");