ALTER TABLE "appointments" ADD COLUMN "meeting_url" text;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "meeting_provider" text DEFAULT 'meet' NOT NULL;--> statement-breakpoint
ALTER TABLE "professionals" ADD COLUMN "default_meeting_url" text;