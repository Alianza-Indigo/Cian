CREATE TYPE "public"."team_relationship" AS ENUM('familiar', 'cuidador', 'docente', 'terapeuta', 'acompanante', 'profesional', 'otro');--> statement-breakpoint
CREATE TYPE "public"."share_permission" AS ENUM('lectura', 'comentario');--> statement-breakpoint
CREATE TYPE "public"."shareable_type" AS ENUM('plan', 'rutina', 'documento', 'material_educativo');--> statement-breakpoint
CREATE TYPE "public"."team_member_status" AS ENUM('invitado', 'activo', 'revocado');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('push', 'correo');--> statement-breakpoint
CREATE TYPE "public"."delivery_status" AS ENUM('enviado', 'fallido', 'omitido');--> statement-breakpoint
CREATE TYPE "public"."reminder_kind" AS ENUM('rutina', 'tarea', 'plan', 'libre');--> statement-breakpoint
CREATE TABLE "resource_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"owner_user_id" text NOT NULL,
	"member_id" uuid NOT NULL,
	"resource_type" "shareable_type" NOT NULL,
	"resource_id" uuid NOT NULL,
	"resource_title" text NOT NULL,
	"permission" "share_permission" DEFAULT 'lectura' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "shared_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"resource_share_id" uuid NOT NULL,
	"author_user_id" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_team_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"owner_user_id" text NOT NULL,
	"member_user_id" text,
	"email" text NOT NULL,
	"display_name" text,
	"relationship" "team_relationship" DEFAULT 'otro' NOT NULL,
	"status" "team_member_status" DEFAULT 'invitado' NOT NULL,
	"invite_token_hash" text,
	"invite_expires_at" timestamp with time zone,
	"invited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "notification_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"reminder_id" uuid,
	"channel" "notification_channel" NOT NULL,
	"status" "delivery_status" NOT NULL,
	"error" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"keys" jsonb NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_success_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"kind" "reminder_kind" DEFAULT 'libre' NOT NULL,
	"resource_id" uuid,
	"title" text NOT NULL,
	"body" text,
	"schedule" jsonb NOT NULL,
	"channels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "notifications" jsonb DEFAULT '{"channels":[],"quietHours":{"startHour":22,"endHour":7},"timeZone":"America/Mexico_City"}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "resource_shares" ADD CONSTRAINT "resource_shares_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_shares" ADD CONSTRAINT "resource_shares_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_shares" ADD CONSTRAINT "resource_shares_member_id_support_team_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."support_team_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_notes" ADD CONSTRAINT "shared_notes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_notes" ADD CONSTRAINT "shared_notes_resource_share_id_resource_shares_id_fk" FOREIGN KEY ("resource_share_id") REFERENCES "public"."resource_shares"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_notes" ADD CONSTRAINT "shared_notes_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_team_members" ADD CONSTRAINT "support_team_members_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_team_members" ADD CONSTRAINT "support_team_members_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_team_members" ADD CONSTRAINT "support_team_members_member_user_id_users_id_fk" FOREIGN KEY ("member_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_reminder_id_reminders_id_fk" FOREIGN KEY ("reminder_id") REFERENCES "public"."reminders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "resource_shares_tenant_id_idx" ON "resource_shares" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "resource_shares_member_idx" ON "resource_shares" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "resource_shares_resource_idx" ON "resource_shares" USING btree ("resource_type","resource_id");--> statement-breakpoint
CREATE UNIQUE INDEX "resource_shares_member_resource_uq" ON "resource_shares" USING btree ("member_id","resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "shared_notes_tenant_id_idx" ON "shared_notes" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "shared_notes_share_idx" ON "shared_notes" USING btree ("resource_share_id","created_at");--> statement-breakpoint
CREATE INDEX "support_team_members_tenant_id_idx" ON "support_team_members" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "support_team_members_member_idx" ON "support_team_members" USING btree ("member_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "support_team_members_owner_email_uq" ON "support_team_members" USING btree ("tenant_id","owner_user_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "support_team_members_token_uq" ON "support_team_members" USING btree ("invite_token_hash");--> statement-breakpoint
CREATE INDEX "notification_log_tenant_id_idx" ON "notification_log" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "notification_log_user_time_idx" ON "notification_log" USING btree ("tenant_id","user_id","sent_at");--> statement-breakpoint
CREATE INDEX "push_subscriptions_tenant_id_idx" ON "push_subscriptions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_idx" ON "push_subscriptions" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_endpoint_uq" ON "push_subscriptions" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "reminders_tenant_id_idx" ON "reminders" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "reminders_active_idx" ON "reminders" USING btree ("active");