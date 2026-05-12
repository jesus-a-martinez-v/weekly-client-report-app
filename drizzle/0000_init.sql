CREATE EXTENSION IF NOT EXISTS "pgcrypto";--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_email" varchar(320) NOT NULL,
	"action" varchar(64) NOT NULL,
	"entity_type" varchar(32) NOT NULL,
	"entity_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"slug" varchar(80) NOT NULL,
	"contact_name" varchar(200) NOT NULL,
	"contact_email" varchar(320) NOT NULL,
	"tone" varchar(40) DEFAULT 'friendly-professional' NOT NULL,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clients_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"name" varchar(120),
	"repos" text[] DEFAULT '{}'::text[] NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"client_id" uuid,
	"client_name" varchar(200) NOT NULL,
	"week_label" varchar(8) NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"window_end" timestamp with time zone NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"totals_prs" integer DEFAULT 0 NOT NULL,
	"totals_issues" integer DEFAULT 0 NOT NULL,
	"totals_commits" integer DEFAULT 0 NOT NULL,
	"activity_json" jsonb,
	"narrative_md" text,
	"email_subject" text,
	"email_body" text,
	"pdf_blob_url" text,
	"pdf_filename" text,
	"gmail_draft_id" varchar(128),
	"sent_at" timestamp with time zone,
	"discarded_at" timestamp with time zone,
	"trigger_run_id" varchar(64),
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" varchar(16) NOT NULL,
	"week_label" varchar(8) NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"window_end" timestamp with time zone NOT NULL,
	"status" varchar(16) DEFAULT 'queued' NOT NULL,
	"trigger_run_id" varchar(64),
	"schedule_id" uuid,
	"error_message" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trigger_schedule_id" varchar(64) NOT NULL,
	"kind" varchar(32) NOT NULL,
	"external_id" varchar(64) NOT NULL,
	"cron" varchar(64) NOT NULL,
	"timezone" varchar(64) DEFAULT 'America/Bogota' NOT NULL,
	"active" text DEFAULT 'true' NOT NULL,
	"next_run" timestamp with time zone,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schedules_trigger_schedule_id_unique" UNIQUE("trigger_schedule_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "projects" ADD CONSTRAINT "projects_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reports" ADD CONSTRAINT "reports_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reports" ADD CONSTRAINT "reports_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "runs" ADD CONSTRAINT "runs_schedule_id_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedules"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_created_at_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "clients_status_idx" ON "clients" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "projects_client_position_idx" ON "projects" USING btree ("client_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "reports_client_week_uq" ON "reports" USING btree ("client_id","week_label") WHERE client_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reports_run_idx" ON "reports" USING btree ("run_id");