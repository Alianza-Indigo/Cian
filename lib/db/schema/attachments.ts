/**
 * Adjuntos de un mensaje.
 *
 * El archivo vive en Vercel Blob con acceso privado, igual que los documentos
 * generados: la URL del store no se expone nunca y todo pasa por una ruta que
 * comprueba el tenant.
 *
 * `message_id` es nullable a propósito: el archivo se sube **antes** de que
 * exista el mensaje, porque quien escribe adjunta primero y envía después. Al
 * enviarse, el adjunto se liga a su mensaje.
 */
import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { users } from './auth';
import { messages } from './chat';
import { ATTACHMENT_KINDS } from '../../attachments/types';

export const attachmentKindEnum = pgEnum('attachment_kind', ATTACHMENT_KINDS);

export const messageAttachments = pgTable(
  'message_attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    messageId: text('message_id').references(() => messages.id, {
      onDelete: 'cascade',
    }),
    kind: attachmentKindEnum('kind').notNull(),
    filename: text('filename').notNull(),
    mime: text('mime').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    blobUrl: text('blob_url').notNull(),
    blobPathname: text('blob_pathname').notNull(),
    /** Solo para los formatos que el modelo no lee (Word, texto). */
    extractedText: text('extracted_text'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('message_attachments_tenant_id_idx').on(table.tenantId),
    index('message_attachments_message_idx').on(table.tenantId, table.messageId),
    // Para barrer los que quedaron sin mensaje (se subieron y no se enviaron).
    index('message_attachments_orphan_idx').on(table.tenantId, table.createdAt),
  ],
);

export type MessageAttachmentRow = typeof messageAttachments.$inferSelect;
