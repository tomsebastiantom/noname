CREATE TABLE "agent_token_grants" (
	"jti" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"agent_id" uuid NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "agent_token_grants_org" ON "agent_token_grants" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "agent_token_grants_expires" ON "agent_token_grants" USING btree ("expires_at");