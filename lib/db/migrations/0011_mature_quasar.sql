CREATE TYPE "public"."billing_cycle" AS ENUM('mensual', 'anual');--> statement-breakpoint
CREATE TYPE "public"."billing_plan" AS ENUM('free', 'personal', 'organization');--> statement-breakpoint
CREATE TYPE "public"."model_purpose" AS ENUM('chat', 'utilidad', 'crisis', 'embeddings');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('activa', 'periodo_de_prueba', 'pago_pendiente', 'cancelada', 'incompleta');--> statement-breakpoint
CREATE TABLE "model_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"purpose" "model_purpose" NOT NULL,
	"provider" text DEFAULT 'google' NOT NULL,
	"model" text NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_limits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan" "billing_plan" NOT NULL,
	"limits" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"plan" "billing_plan" DEFAULT 'free' NOT NULL,
	"cycle" "billing_cycle",
	"status" "subscription_status" DEFAULT 'incompleta' NOT NULL,
	"seats" integer DEFAULT 1 NOT NULL,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "model_configs" ADD CONSTRAINT "model_configs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "model_configs_tenant_idx" ON "model_configs" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "model_configs_tenant_purpose_uq" ON "model_configs" USING btree ("tenant_id","purpose");--> statement-breakpoint
CREATE UNIQUE INDEX "model_configs_global_purpose_uq" ON "model_configs" USING btree ("purpose") WHERE tenant_id is null;--> statement-breakpoint
CREATE UNIQUE INDEX "plan_limits_plan_uq" ON "plan_limits" USING btree ("plan");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_tenant_uq" ON "subscriptions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "subscriptions_stripe_sub_idx" ON "subscriptions" USING btree ("stripe_subscription_id");--> statement-breakpoint
CREATE INDEX "subscriptions_stripe_customer_idx" ON "subscriptions" USING btree ("stripe_customer_id");