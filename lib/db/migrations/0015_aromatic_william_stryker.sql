DROP INDEX "library_resources_slug_uq";--> statement-breakpoint
CREATE UNIQUE INDEX "library_resources_global_slug_uq" ON "library_resources" USING btree ("slug") WHERE "library_resources"."tenant_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "library_resources_tenant_slug_uq" ON "library_resources" USING btree ("tenant_id","slug") WHERE "library_resources"."tenant_id" is not null;