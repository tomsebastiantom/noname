CREATE TYPE "public"."document_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."machine_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."flag_status" AS ENUM('active', 'inactive', 'archived');--> statement-breakpoint
CREATE TYPE "public"."flag_type" AS ENUM('boolean', 'multivariate', 'percentage');--> statement-breakpoint
CREATE TYPE "public"."agent_task_status" AS ENUM('pending', 'running', 'completed', 'failed', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."agent_task_type" AS ENUM('generate_layout', 'generate_content', 'generate_machine', 'analyze_analytics', 'orchestrate');--> statement-breakpoint
CREATE TABLE "content_collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"slug" text NOT NULL,
	"label" text NOT NULL,
	"parent_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"slug" text NOT NULL,
	"label" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_ops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"document_id" uuid NOT NULL,
	"server_version" bigint NOT NULL,
	"operation" text NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text NOT NULL,
	"on_behalf_of" text,
	"task_id" uuid,
	"client_id" text,
	"client_seq" bigint,
	"payload" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"schema" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"type" text NOT NULL,
	"key" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"segment" text DEFAULT 'default' NOT NULL,
	"status" "document_status" DEFAULT 'draft' NOT NULL,
	"base_version" integer,
	"data" jsonb NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb,
	"collection_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"type" text NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"input_record_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"output_record_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp NOT NULL,
	"recorded_at" timestamp DEFAULT now() NOT NULL,
	"correlation_id" text,
	"causation_id" text,
	"idempotency_key" text
);
--> statement-breakpoint
CREATE TABLE "evidence_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"action" text NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"reason" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp NOT NULL,
	"correlation_id" text,
	"idempotency_key" text,
	"recorded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"from_id" uuid NOT NULL,
	"to_id" uuid NOT NULL,
	"relation" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"type" text NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"data" jsonb NOT NULL,
	"source" text NOT NULL,
	"occurred_at" timestamp NOT NULL,
	"recorded_at" timestamp DEFAULT now() NOT NULL,
	"correlation_id" text,
	"causation_id" text,
	"idempotency_key" text,
	"integrity_hash" text
);
--> statement-breakpoint
CREATE TABLE "collab_automerge_chunks" (
	"org_id" text NOT NULL,
	"layout_document_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"binary" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "collab_automerge_chunks_org_id_layout_document_id_storage_key_pk" PRIMARY KEY("org_id","layout_document_id","storage_key")
);
--> statement-breakpoint
CREATE TABLE "machine_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"definition" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "machine_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"machine_name" text NOT NULL,
	"current_state" text NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "machine_transitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instance_id" uuid NOT NULL,
	"org_id" text,
	"revision" integer,
	"event" text NOT NULL,
	"from_state" text NOT NULL,
	"to_state" text NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb,
	"guard_result" jsonb DEFAULT '{}'::jsonb,
	"success" text DEFAULT 'true' NOT NULL,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"published_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "machines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"definition" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" "machine_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flag_evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"flag_id" uuid NOT NULL,
	"org_id" text NOT NULL,
	"context_hash" text,
	"subject_kind" text,
	"value" jsonb NOT NULL,
	"matched_rule" jsonb,
	"reason" text NOT NULL,
	"schema_id" uuid,
	"variant_id" uuid,
	"evaluated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"key" text NOT NULL,
	"type" "flag_type" NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"default_value" jsonb NOT NULL,
	"targeting" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "flag_status" DEFAULT 'active' NOT NULL,
	"schema_id" uuid,
	"variant_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"type" "agent_task_type" NOT NULL,
	"status" "agent_task_status" DEFAULT 'pending' NOT NULL,
	"prompt" text NOT NULL,
	"input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output" jsonb,
	"error" text,
	"model" text,
	"tokens" integer,
	"created_actor_type" text,
	"created_actor_id" text,
	"created_on_behalf_of" text,
	"approved_actor_type" text,
	"approved_actor_id" text,
	"approved_on_behalf_of" text,
	"approved_at" timestamp,
	"rejected_actor_type" text,
	"rejected_actor_id" text,
	"rejected_on_behalf_of" text,
	"rejected_at" timestamp,
	"registered_agent_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "registered_agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"slug" text NOT NULL,
	"label" text NOT NULL,
	"owner_user_id" text NOT NULL,
	"allowed_tools" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_generations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"prompt" text NOT NULL,
	"response" jsonb NOT NULL,
	"model" text NOT NULL,
	"tokens" integer NOT NULL,
	"target_type" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audience_activity_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"activity_id" text NOT NULL,
	"activity_type" text NOT NULL,
	"activity_version" integer NOT NULL,
	"subject_user_id" text,
	"occurred_at" timestamp NOT NULL,
	"facts" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"processed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "audience_assignment_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"audience_key" text NOT NULL,
	"activity_id" text NOT NULL,
	"definition_version" integer NOT NULL,
	"action" text NOT NULL,
	"occurred_at" timestamp NOT NULL,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audience_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"audience_key" text NOT NULL,
	"source_activity_id" text NOT NULL,
	"definition_version" integer NOT NULL,
	"assigned_at" timestamp NOT NULL,
	"expires_at" timestamp,
	"revoked_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audience_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"audience_key" text NOT NULL,
	"action" text NOT NULL,
	"version" integer,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audience_definition_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"audience_key" text NOT NULL,
	"version" integer NOT NULL,
	"activity_type" text NOT NULL,
	"activity_version" integer NOT NULL,
	"condition" jsonb NOT NULL,
	"action" text NOT NULL,
	"expiry" jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"activated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "audience_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"key" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"active_version" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audience_experience_bindings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"audience_key" text NOT NULL,
	"version" integer NOT NULL,
	"page_key" text NOT NULL,
	"locale" text,
	"schema_id" text NOT NULL,
	"variant_id" text NOT NULL,
	"goal_event" text NOT NULL,
	"attribution_window_days" numeric(14, 12) NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"activated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "audience_experience_decisions" (
	"decision_id" uuid PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"verified_user_id" text NOT NULL,
	"session_id" uuid NOT NULL,
	"audience_key" text NOT NULL,
	"audience_definition_version" integer NOT NULL,
	"binding_id" uuid NOT NULL,
	"binding_version" integer NOT NULL,
	"page_key" text NOT NULL,
	"locale" text,
	"schema_id" text NOT NULL,
	"variant_id" text NOT NULL,
	"goal_event" text NOT NULL,
	"attribution_window_days" numeric(14, 12) NOT NULL,
	"served_at" timestamp NOT NULL,
	"rendered_at" timestamp,
	"render_deadline_at" timestamp NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audience_experience_outcomes" (
	"org_id" text NOT NULL,
	"activity_id" text NOT NULL,
	"decision_id" uuid NOT NULL,
	"activity_type" text NOT NULL,
	"occurred_at" timestamp NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comms_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"user_id" text,
	"channel" text NOT NULL,
	"provider" text NOT NULL,
	"to_address" text NOT NULL,
	"subject" text,
	"status" text NOT NULL,
	"provider_message_id" text,
	"error" text,
	"trigger" text,
	"template_id" text,
	"idempotency_key" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"body_html" text,
	"body_text" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"sent_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "comms_delivery_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"delivery_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"occurred_at" timestamp NOT NULL,
	"provider_event_id" text,
	"raw_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comms_inbox_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"trigger" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"preferences" jsonb DEFAULT '{"channels":{"email":true,"sms":false,"in_app":true},"categories":{"marketing":false,"operational":true}}'::jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "capability_idempotency" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"capability" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"status" text NOT NULL,
	"result" json,
	"error" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_event_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"connection_id" text NOT NULL,
	"event_key" text NOT NULL,
	"provider_event_id" text,
	"delivery_id" text,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_outbound_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"subscription_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"event_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_status_code" integer,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"delivered_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "webhook_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"url" text NOT NULL,
	"event_types" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"description" text,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audience_experience_outcomes" ADD CONSTRAINT "audience_exp_outcome_decision_fk" FOREIGN KEY ("decision_id") REFERENCES "public"."audience_experience_decisions"("decision_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "content_collections_org_slug" ON "content_collections" USING btree ("org_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "content_teams_org_slug" ON "content_teams" USING btree ("org_id","slug");--> statement-breakpoint
CREATE INDEX "document_ops_document" ON "document_ops" USING btree ("org_id","document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "document_ops_client_dedup" ON "document_ops" USING btree ("client_id","client_seq");--> statement-breakpoint
CREATE UNIQUE INDEX "document_ops_server_version_unique" ON "document_ops" USING btree ("org_id","document_id","server_version");--> statement-breakpoint
CREATE UNIQUE INDEX "document_types_tenant_name" ON "document_types" USING btree ("org_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "documents_published_unique" ON "documents" USING btree ("org_id","type","key","segment","status") WHERE "documents"."status" = 'published' AND "documents"."type" = 'layout';--> statement-breakpoint
CREATE UNIQUE INDEX "documents_tenant_type_key" ON "documents" USING btree ("org_id","type","key","segment");--> statement-breakpoint
CREATE INDEX "documents_tenant_type" ON "documents" USING btree ("org_id","type");--> statement-breakpoint
CREATE INDEX "documents_org_collection_idx" ON "documents" USING btree ("org_id","collection_id");--> statement-breakpoint
CREATE INDEX "documents_org_status_idx" ON "documents" USING btree ("org_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "documents_store_slug_unique" ON "documents" USING btree (("data"->>'slug')) WHERE "documents"."type" = 'tenant_settings' AND "documents"."key" = 'default';--> statement-breakpoint
CREATE INDEX "evidence_activities_org_type_recorded_idx" ON "evidence_activities" USING btree ("org_id","type","recorded_at");--> statement-breakpoint
CREATE UNIQUE INDEX "evidence_activities_org_type_idempotency_idx" ON "evidence_activities" USING btree ("org_id","type","idempotency_key") WHERE "evidence_activities"."idempotency_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "evidence_audit_org_subject_idx" ON "evidence_audit_events" USING btree ("org_id","subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "evidence_audit_org_recorded_idx" ON "evidence_audit_events" USING btree ("org_id","recorded_at");--> statement-breakpoint
CREATE UNIQUE INDEX "evidence_audit_org_action_idempotency_idx" ON "evidence_audit_events" USING btree ("org_id","action","idempotency_key") WHERE "evidence_audit_events"."idempotency_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "evidence_links_org_from_idx" ON "evidence_links" USING btree ("org_id","from_id");--> statement-breakpoint
CREATE INDEX "evidence_links_org_to_idx" ON "evidence_links" USING btree ("org_id","to_id");--> statement-breakpoint
CREATE UNIQUE INDEX "evidence_links_org_edge_idx" ON "evidence_links" USING btree ("org_id","from_id","to_id","relation");--> statement-breakpoint
CREATE INDEX "evidence_records_org_type_recorded_idx" ON "evidence_records" USING btree ("org_id","type","recorded_at");--> statement-breakpoint
CREATE INDEX "evidence_records_org_subject_idx" ON "evidence_records" USING btree ("org_id","subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "evidence_records_org_correlation_idx" ON "evidence_records" USING btree ("org_id","correlation_id") WHERE "evidence_records"."correlation_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "evidence_records_org_type_idempotency_idx" ON "evidence_records" USING btree ("org_id","type","idempotency_key") WHERE "evidence_records"."idempotency_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "collab_automerge_chunks_layout" ON "collab_automerge_chunks" USING btree ("org_id","layout_document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "machine_definitions_tenant_name" ON "machine_definitions" USING btree ("org_id","name");--> statement-breakpoint
CREATE INDEX "machine_instances_org_name_idx" ON "machine_instances" USING btree ("org_id","machine_name");--> statement-breakpoint
CREATE INDEX "machine_instances_org_idx" ON "machine_instances" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "machine_instances_org_name_state_created_idx" ON "machine_instances" USING btree ("org_id","machine_name","current_state","created_at","id");--> statement-breakpoint
CREATE INDEX "machine_transitions_instance_idx" ON "machine_transitions" USING btree ("instance_id");--> statement-breakpoint
CREATE INDEX "machine_transitions_unpublished_idx" ON "machine_transitions" USING btree ("id") WHERE "machine_transitions"."published_at" is null and "machine_transitions"."success" = 'true';--> statement-breakpoint
CREATE INDEX "flag_evals_flag_time" ON "flag_evaluations" USING btree ("flag_id","evaluated_at");--> statement-breakpoint
CREATE INDEX "flag_evals_subject_time" ON "flag_evaluations" USING btree ("org_id","subject_kind","evaluated_at");--> statement-breakpoint
CREATE INDEX "flag_evals_evaluated_at" ON "flag_evaluations" USING btree ("evaluated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "flags_tenant_key" ON "flags" USING btree ("org_id","key");--> statement-breakpoint
CREATE INDEX "flags_tenant_status" ON "flags" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "flags_tenant_schema" ON "flags" USING btree ("org_id","schema_id");--> statement-breakpoint
CREATE INDEX "agent_tasks_tenant_status" ON "agent_tasks" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "agent_tasks_tenant_type" ON "agent_tasks" USING btree ("org_id","type");--> statement-breakpoint
CREATE UNIQUE INDEX "registered_agents_org_slug" ON "registered_agents" USING btree ("org_id","slug");--> statement-breakpoint
CREATE INDEX "ai_generations_org_created_idx" ON "ai_generations" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "audience_receipts_tenant_activity" ON "audience_activity_receipts" USING btree ("org_id","activity_id");--> statement-breakpoint
CREATE INDEX "audience_receipts_pending" ON "audience_activity_receipts" USING btree ("org_id","status","created_at");--> statement-breakpoint
CREATE INDEX "audience_assignment_history_subject" ON "audience_assignment_history" USING btree ("org_id","user_id","audience_key","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "audience_assignment_history_event" ON "audience_assignment_history" USING btree ("org_id","activity_id","audience_key");--> statement-breakpoint
CREATE UNIQUE INDEX "audience_assignments_tenant_member" ON "audience_assignments" USING btree ("org_id","user_id","audience_key");--> statement-breakpoint
CREATE INDEX "audience_assignments_active_lookup" ON "audience_assignments" USING btree ("org_id","user_id","revoked_at","expires_at");--> statement-breakpoint
CREATE INDEX "audience_audit_tenant_history" ON "audience_audit_log" USING btree ("org_id","audience_key","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "audience_definition_versions_tenant_key_version" ON "audience_definition_versions" USING btree ("org_id","audience_key","version");--> statement-breakpoint
CREATE INDEX "audience_definition_versions_active" ON "audience_definition_versions" USING btree ("org_id","activity_type","status");--> statement-breakpoint
CREATE UNIQUE INDEX "audience_definitions_tenant_key" ON "audience_definitions" USING btree ("org_id","key");--> statement-breakpoint
CREATE INDEX "audience_definitions_tenant_status" ON "audience_definitions" USING btree ("org_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "audience_bindings_tenant_key_version" ON "audience_experience_bindings" USING btree ("org_id","audience_key","version");--> statement-breakpoint
CREATE INDEX "audience_bindings_tenant_lookup" ON "audience_experience_bindings" USING btree ("org_id","audience_key","status");--> statement-breakpoint
CREATE UNIQUE INDEX "audience_decisions_tenant_id" ON "audience_experience_decisions" USING btree ("org_id","decision_id");--> statement-breakpoint
CREATE INDEX "audience_decisions_subject_window" ON "audience_experience_decisions" USING btree ("org_id","verified_user_id","goal_event","rendered_at","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "audience_experience_outcomes_tenant_activity" ON "audience_experience_outcomes" USING btree ("org_id","activity_id");--> statement-breakpoint
CREATE INDEX "audience_experience_outcomes_decision" ON "audience_experience_outcomes" USING btree ("org_id","decision_id","expires_at");--> statement-breakpoint
CREATE INDEX "comms_deliveries_org_id_idx" ON "comms_deliveries" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "comms_deliveries_user_id_idx" ON "comms_deliveries" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "comms_deliveries_status_idx" ON "comms_deliveries" USING btree ("status");--> statement-breakpoint
CREATE INDEX "comms_deliveries_created_at_idx" ON "comms_deliveries" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "comms_deliveries_org_idempotency_idx" ON "comms_deliveries" USING btree ("org_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "comms_delivery_events_delivery_id_idx" ON "comms_delivery_events" USING btree ("delivery_id");--> statement-breakpoint
CREATE INDEX "comms_delivery_events_org_id_idx" ON "comms_delivery_events" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "comms_delivery_events_provider_event_id_idx" ON "comms_delivery_events" USING btree ("provider_event_id");--> statement-breakpoint
CREATE INDEX "comms_inbox_org_user_idx" ON "comms_inbox_items" USING btree ("org_id","user_id");--> statement-breakpoint
CREATE INDEX "comms_inbox_read_at_idx" ON "comms_inbox_items" USING btree ("read_at");--> statement-breakpoint
CREATE INDEX "comms_inbox_created_at_idx" ON "comms_inbox_items" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_preferences_org_user_idx" ON "notification_preferences" USING btree ("org_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "capability_idempotency_org_capability_key_idx" ON "capability_idempotency" USING btree ("org_id","capability","idempotency_key");--> statement-breakpoint
CREATE INDEX "capability_idempotency_expires_at_idx" ON "capability_idempotency" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_event_receipts_connection_key_idx" ON "provider_event_receipts" USING btree ("connection_id","event_key");--> statement-breakpoint
CREATE INDEX "provider_event_receipts_org_status_idx" ON "provider_event_receipts" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "provider_event_receipts_created_at_idx" ON "provider_event_receipts" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_outbound_subscription_event_idx" ON "webhook_outbound_deliveries" USING btree ("subscription_id","event_id");--> statement-breakpoint
CREATE INDEX "webhook_outbound_org_id_idx" ON "webhook_outbound_deliveries" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "webhook_outbound_subscription_idx" ON "webhook_outbound_deliveries" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "webhook_outbound_status_idx" ON "webhook_outbound_deliveries" USING btree ("status");--> statement-breakpoint
CREATE INDEX "webhook_subscriptions_org_id_idx" ON "webhook_subscriptions" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "webhook_subscriptions_enabled_idx" ON "webhook_subscriptions" USING btree ("enabled");