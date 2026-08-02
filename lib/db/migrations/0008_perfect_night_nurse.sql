CREATE TYPE "public"."education_kind" AS ENUM('adaptacion', 'agenda_visual', 'reunion_escolar', 'apoyo_de_clase');--> statement-breakpoint
CREATE TYPE "public"."library_category" AS ENUM('neurodivergencia', 'educacion', 'comunicacion', 'inclusion', 'derechos', 'accesibilidad', 'estrategias', 'vida_diaria', 'familias');--> statement-breakpoint
CREATE TABLE "education_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"kind" "education_kind" NOT NULL,
	"title" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"document_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resource_id" uuid NOT NULL,
	"tenant_id" uuid,
	"chunk_index" integer NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(1536),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library_resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"category" "library_category" NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source" text,
	"reviewed_at" timestamp with time zone,
	"content" text NOT NULL,
	"content_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "education_items" ADD CONSTRAINT "education_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "education_items" ADD CONSTRAINT "education_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "education_items" ADD CONSTRAINT "education_items_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_chunks" ADD CONSTRAINT "library_chunks_resource_id_library_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."library_resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_chunks" ADD CONSTRAINT "library_chunks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_resources" ADD CONSTRAINT "library_resources_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "education_items_tenant_id_idx" ON "education_items" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "education_items_tenant_user_recent_idx" ON "education_items" USING btree ("tenant_id","user_id","created_at");--> statement-breakpoint
CREATE INDEX "library_chunks_resource_idx" ON "library_chunks" USING btree ("resource_id");--> statement-breakpoint
CREATE INDEX "library_chunks_tenant_idx" ON "library_chunks" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "library_chunks_embedding_idx" ON "library_chunks" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "library_resources_slug_uq" ON "library_resources" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "library_resources_category_idx" ON "library_resources" USING btree ("category");--> statement-breakpoint
CREATE INDEX "library_resources_tenant_idx" ON "library_resources" USING btree ("tenant_id");