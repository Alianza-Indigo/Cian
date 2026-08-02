CREATE TYPE "public"."objective_status" AS ENUM('pendiente', 'en_progreso', 'logrado');--> statement-breakpoint
CREATE TYPE "public"."plan_status" AS ENUM('activo', 'pausado', 'terminado');--> statement-breakpoint
CREATE TYPE "public"."plan_type" AS ENUM('personalizado', 'familiar', 'escolar', 'autonomia', 'seguimiento');--> statement-breakpoint
CREATE TYPE "public"."routine_type" AS ENUM('matutina', 'nocturna', 'escolar', 'laboral', 'sensorial', 'descanso', 'alimentacion');--> statement-breakpoint
CREATE TABLE "plan_objectives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"order_index" integer DEFAULT 0 NOT NULL,
	"status" "objective_status" DEFAULT 'pendiente' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"objective_id" uuid,
	"note" text,
	"rating" integer,
	"logged_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_strategies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"objective_id" uuid NOT NULL,
	"content" text NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"conversation_id" uuid,
	"type" "plan_type" DEFAULT 'personalizado' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" "plan_status" DEFAULT 'activo' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "routine_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"routine_id" uuid NOT NULL,
	"completed_steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"note" text,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "routine_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"routine_id" uuid NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"title" text NOT NULL,
	"duration_seconds" integer,
	"icon" text,
	"image_url" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "routines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"conversation_id" uuid,
	"type" "routine_type" DEFAULT 'matutina' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "plan_objectives" ADD CONSTRAINT "plan_objectives_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_objectives" ADD CONSTRAINT "plan_objectives_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_progress" ADD CONSTRAINT "plan_progress_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_progress" ADD CONSTRAINT "plan_progress_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_progress" ADD CONSTRAINT "plan_progress_objective_id_plan_objectives_id_fk" FOREIGN KEY ("objective_id") REFERENCES "public"."plan_objectives"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_strategies" ADD CONSTRAINT "plan_strategies_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_strategies" ADD CONSTRAINT "plan_strategies_objective_id_plan_objectives_id_fk" FOREIGN KEY ("objective_id") REFERENCES "public"."plan_objectives"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_logs" ADD CONSTRAINT "routine_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_logs" ADD CONSTRAINT "routine_logs_routine_id_routines_id_fk" FOREIGN KEY ("routine_id") REFERENCES "public"."routines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_steps" ADD CONSTRAINT "routine_steps_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_steps" ADD CONSTRAINT "routine_steps_routine_id_routines_id_fk" FOREIGN KEY ("routine_id") REFERENCES "public"."routines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routines" ADD CONSTRAINT "routines_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routines" ADD CONSTRAINT "routines_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routines" ADD CONSTRAINT "routines_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plan_objectives_tenant_id_idx" ON "plan_objectives" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "plan_objectives_plan_order_idx" ON "plan_objectives" USING btree ("tenant_id","plan_id","order_index");--> statement-breakpoint
CREATE INDEX "plan_progress_tenant_id_idx" ON "plan_progress" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "plan_progress_plan_time_idx" ON "plan_progress" USING btree ("tenant_id","plan_id","logged_at");--> statement-breakpoint
CREATE INDEX "plan_strategies_tenant_id_idx" ON "plan_strategies" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "plan_strategies_objective_order_idx" ON "plan_strategies" USING btree ("tenant_id","objective_id","order_index");--> statement-breakpoint
CREATE INDEX "plans_tenant_id_idx" ON "plans" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "plans_tenant_user_recent_idx" ON "plans" USING btree ("tenant_id","user_id","updated_at");--> statement-breakpoint
CREATE INDEX "routine_logs_tenant_id_idx" ON "routine_logs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "routine_logs_routine_time_idx" ON "routine_logs" USING btree ("tenant_id","routine_id","completed_at");--> statement-breakpoint
CREATE INDEX "routine_steps_tenant_id_idx" ON "routine_steps" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "routine_steps_routine_order_idx" ON "routine_steps" USING btree ("tenant_id","routine_id","order_index");--> statement-breakpoint
CREATE INDEX "routines_tenant_id_idx" ON "routines" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "routines_tenant_user_recent_idx" ON "routines" USING btree ("tenant_id","user_id","updated_at");