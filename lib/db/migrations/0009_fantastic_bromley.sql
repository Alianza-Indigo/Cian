CREATE TYPE "public"."crisis_outcome" AS ENUM('se_regulo', 'bajo_poco_a_poco', 'termino_agotado', 'sigue_activa', 'se_derivo');--> statement-breakpoint
CREATE TYPE "public"."crisis_severity" AS ENUM('leve', 'moderada', 'intensa');--> statement-breakpoint
CREATE TABLE "crisis_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"conversation_id" uuid,
	"severity" "crisis_severity" DEFAULT 'moderada' NOT NULL,
	"summary" text,
	"triggers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"actions_taken" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"outcome" "crisis_outcome",
	"escalated" boolean DEFAULT false NOT NULL,
	"escalation_signals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"post_plan_id" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "crisis_protocols" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crisis_events" ADD CONSTRAINT "crisis_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crisis_events" ADD CONSTRAINT "crisis_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crisis_events" ADD CONSTRAINT "crisis_events_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crisis_events" ADD CONSTRAINT "crisis_events_post_plan_id_plans_id_fk" FOREIGN KEY ("post_plan_id") REFERENCES "public"."plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crisis_protocols" ADD CONSTRAINT "crisis_protocols_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crisis_protocols" ADD CONSTRAINT "crisis_protocols_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crisis_events_tenant_id_idx" ON "crisis_events" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "crisis_events_tenant_time_idx" ON "crisis_events" USING btree ("tenant_id","user_id","started_at");--> statement-breakpoint
CREATE INDEX "crisis_protocols_tenant_id_idx" ON "crisis_protocols" USING btree ("tenant_id");