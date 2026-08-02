ALTER TABLE "tenants" ADD COLUMN "platform_plan" "tenant_plan";--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "platform_limits" jsonb;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "platform_note" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "platform_granted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "platform_granted_by" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_platform_granted_by_users_id_fk" FOREIGN KEY ("platform_granted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;