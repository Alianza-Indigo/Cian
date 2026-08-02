CREATE TYPE "public"."sensory_outcome" AS ENUM('mejoro', 'igual', 'empeoro');--> statement-breakpoint
CREATE TYPE "public"."sensory_sensitivity" AS ENUM('hipersensible', 'sensible', 'sin_dificultad', 'hiposensible', 'variable');--> statement-breakpoint
CREATE TYPE "public"."sensory_domain" AS ENUM('sonidos', 'luces', 'texturas', 'temperatura', 'olores', 'interocepcion', 'propiocepcion');--> statement-breakpoint
CREATE TYPE "public"."task_priority" AS ENUM('baja', 'media', 'alta');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('pendiente', 'en_progreso', 'hecha');--> statement-breakpoint
CREATE TABLE "food_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"accepted" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"avoided" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"textures" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meal_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"week_start" text NOT NULL,
	"plan" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sensory_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"domain" "sensory_domain" NOT NULL,
	"intensity" integer,
	"context" text,
	"strategy_used" text,
	"outcome" "sensory_outcome",
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sensory_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"domain" "sensory_domain" NOT NULL,
	"sensitivity" "sensory_sensitivity" DEFAULT 'sin_dificultad' NOT NULL,
	"triggers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"strategies" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sensory_tools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"domain" "sensory_domain",
	"effective" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shopping_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"meal_plan_id" uuid NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"parent_task_id" uuid,
	"title" text NOT NULL,
	"notes" text,
	"priority" "task_priority" DEFAULT 'media' NOT NULL,
	"estimated_minutes" integer,
	"status" "task_status" DEFAULT 'pendiente' NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"due_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "food_profiles" ADD CONSTRAINT "food_profiles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_profiles" ADD CONSTRAINT "food_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_plans" ADD CONSTRAINT "meal_plans_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_plans" ADD CONSTRAINT "meal_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sensory_events" ADD CONSTRAINT "sensory_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sensory_events" ADD CONSTRAINT "sensory_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sensory_profiles" ADD CONSTRAINT "sensory_profiles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sensory_profiles" ADD CONSTRAINT "sensory_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sensory_tools" ADD CONSTRAINT "sensory_tools_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sensory_tools" ADD CONSTRAINT "sensory_tools_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_lists" ADD CONSTRAINT "shopping_lists_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_lists" ADD CONSTRAINT "shopping_lists_meal_plan_id_meal_plans_id_fk" FOREIGN KEY ("meal_plan_id") REFERENCES "public"."meal_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "food_profiles_tenant_id_idx" ON "food_profiles" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "food_profiles_tenant_user_uq" ON "food_profiles" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE INDEX "meal_plans_tenant_id_idx" ON "meal_plans" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "meal_plans_tenant_user_week_uq" ON "meal_plans" USING btree ("tenant_id","user_id","week_start");--> statement-breakpoint
CREATE INDEX "sensory_events_tenant_id_idx" ON "sensory_events" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "sensory_events_tenant_time_idx" ON "sensory_events" USING btree ("tenant_id","user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "sensory_profiles_tenant_id_idx" ON "sensory_profiles" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sensory_profiles_tenant_user_domain_uq" ON "sensory_profiles" USING btree ("tenant_id","user_id","domain");--> statement-breakpoint
CREATE INDEX "sensory_tools_tenant_id_idx" ON "sensory_tools" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "shopping_lists_tenant_id_idx" ON "shopping_lists" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "shopping_lists_plan_idx" ON "shopping_lists" USING btree ("tenant_id","meal_plan_id");--> statement-breakpoint
CREATE INDEX "tasks_tenant_id_idx" ON "tasks" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "tasks_tenant_user_status_idx" ON "tasks" USING btree ("tenant_id","user_id","status");--> statement-breakpoint
CREATE INDEX "tasks_parent_idx" ON "tasks" USING btree ("tenant_id","parent_task_id");