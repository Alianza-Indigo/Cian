ALTER TABLE "user_memories" DROP CONSTRAINT "user_memories_source_message_id_messages_id_fk";--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "id" SET DATA TYPE text USING "id"::text;--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;--> statement-breakpoint
ALTER TABLE "user_memories" ALTER COLUMN "source_message_id" SET DATA TYPE text USING "source_message_id"::text;--> statement-breakpoint
ALTER TABLE "user_memories" ADD CONSTRAINT "user_memories_source_message_id_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;
