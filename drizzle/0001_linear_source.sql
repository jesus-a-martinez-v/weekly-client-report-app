ALTER TABLE "clients" ADD COLUMN "source" varchar(16) DEFAULT 'github' NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "linear_token_enc" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "linear_team_key" varchar(20);--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "linear_project_id" varchar(64);