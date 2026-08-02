ALTER TABLE "appointments" ADD COLUMN "notice_sent_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "appointments_notice_idx" ON "appointments" USING btree ("status","scheduled_at");