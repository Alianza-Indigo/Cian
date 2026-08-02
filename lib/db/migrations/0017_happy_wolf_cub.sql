CREATE TABLE "session_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"shared_by_user_id" text NOT NULL,
	"resource_type" "shareable_type" NOT NULL,
	"resource_id" uuid NOT NULL,
	"resource_title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "session_shares" ADD CONSTRAINT "session_shares_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_shares" ADD CONSTRAINT "session_shares_session_id_consult_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."consult_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_shares" ADD CONSTRAINT "session_shares_shared_by_user_id_users_id_fk" FOREIGN KEY ("shared_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "session_shares_tenant_id_idx" ON "session_shares" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "session_shares_session_idx" ON "session_shares" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "session_shares_session_resource_uq" ON "session_shares" USING btree ("session_id","resource_type","resource_id");