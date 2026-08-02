CREATE TYPE "public"."appointment_status" AS ENUM('solicitada', 'confirmada', 'cancelada', 'completada', 'no_asistio');--> statement-breakpoint
CREATE TYPE "public"."note_visibility" AS ENUM('privada', 'compartida');--> statement-breakpoint
CREATE TYPE "public"."session_task_status" AS ENUM('pendiente', 'hecha', 'cancelada');--> statement-breakpoint
CREATE TYPE "public"."specialty" AS ENUM('psicologia', 'psiquiatria', 'neurologia', 'terapia_ocupacional', 'terapia_del_lenguaje', 'nutricion', 'educacion_especial', 'docencia', 'orientacion_familiar', 'trabajo_social', 'asesoria_en_derechos', 'insercion_laboral', 'vida_independiente', 'coaching', 'grupos_de_apoyo');--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('pendiente', 'verificado', 'suspendido', 'rechazado');--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"professional_id" uuid NOT NULL,
	"client_user_id" text NOT NULL,
	"status" "appointment_status" DEFAULT 'solicitada' NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"duration_minutes" integer DEFAULT 50 NOT NULL,
	"room_id" text NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "availability_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"professional_id" uuid NOT NULL,
	"weekday" integer NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"timezone" text DEFAULT 'America/Mexico_City' NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consult_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"appointment_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"recording_url" text,
	"recording_consent" jsonb DEFAULT '{"signatures":[]}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "professionals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"specialties" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"license_number" text,
	"license_docs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"verification_status" "verification_status" DEFAULT 'pendiente' NOT NULL,
	"verified_at" timestamp with time zone,
	"bio" text,
	"terms_accepted_at" timestamp with time zone,
	"terms_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"author_user_id" text NOT NULL,
	"visibility" "note_visibility" DEFAULT 'privada' NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"content" text NOT NULL,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"assigned_to_user_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"due_at" timestamp with time zone,
	"status" "session_task_status" DEFAULT 'pendiente' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whiteboard_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"state" jsonb DEFAULT '{"strokes":[]}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_professional_id_professionals_id_fk" FOREIGN KEY ("professional_id") REFERENCES "public"."professionals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_client_user_id_users_id_fk" FOREIGN KEY ("client_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_slots" ADD CONSTRAINT "availability_slots_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_slots" ADD CONSTRAINT "availability_slots_professional_id_professionals_id_fk" FOREIGN KEY ("professional_id") REFERENCES "public"."professionals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consult_sessions" ADD CONSTRAINT "consult_sessions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consult_sessions" ADD CONSTRAINT "consult_sessions_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professionals" ADD CONSTRAINT "professionals_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professionals" ADD CONSTRAINT "professionals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_notes" ADD CONSTRAINT "session_notes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_notes" ADD CONSTRAINT "session_notes_session_id_consult_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."consult_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_notes" ADD CONSTRAINT "session_notes_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_summaries" ADD CONSTRAINT "session_summaries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_summaries" ADD CONSTRAINT "session_summaries_session_id_consult_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."consult_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_summaries" ADD CONSTRAINT "session_summaries_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_tasks" ADD CONSTRAINT "session_tasks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_tasks" ADD CONSTRAINT "session_tasks_session_id_consult_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."consult_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_tasks" ADD CONSTRAINT "session_tasks_assigned_to_user_id_users_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whiteboard_states" ADD CONSTRAINT "whiteboard_states_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whiteboard_states" ADD CONSTRAINT "whiteboard_states_session_id_consult_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."consult_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appointments_tenant_id_idx" ON "appointments" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "appointments_professional_time_idx" ON "appointments" USING btree ("professional_id","scheduled_at");--> statement-breakpoint
CREATE INDEX "appointments_client_idx" ON "appointments" USING btree ("client_user_id","scheduled_at");--> statement-breakpoint
CREATE INDEX "availability_slots_tenant_id_idx" ON "availability_slots" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "availability_slots_professional_idx" ON "availability_slots" USING btree ("professional_id");--> statement-breakpoint
CREATE INDEX "sessions_tenant_id_idx" ON "consult_sessions" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_appointment_uq" ON "consult_sessions" USING btree ("appointment_id");--> statement-breakpoint
CREATE INDEX "professionals_tenant_id_idx" ON "professionals" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "professionals_status_idx" ON "professionals" USING btree ("verification_status");--> statement-breakpoint
CREATE UNIQUE INDEX "professionals_tenant_user_uq" ON "professionals" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE INDEX "session_notes_tenant_id_idx" ON "session_notes" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "session_notes_session_visibility_idx" ON "session_notes" USING btree ("session_id","visibility");--> statement-breakpoint
CREATE INDEX "session_summaries_tenant_id_idx" ON "session_summaries" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "session_summaries_session_uq" ON "session_summaries" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "session_tasks_tenant_id_idx" ON "session_tasks" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "session_tasks_assignee_idx" ON "session_tasks" USING btree ("assigned_to_user_id","status");--> statement-breakpoint
CREATE INDEX "whiteboard_states_tenant_id_idx" ON "whiteboard_states" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "whiteboard_states_session_uq" ON "whiteboard_states" USING btree ("session_id");