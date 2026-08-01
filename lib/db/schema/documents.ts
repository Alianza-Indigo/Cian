/**
 * Documentos generados.
 *
 * Dos tablas y una razón: `documents` es lo que la persona ve en su
 * biblioteca; `document_jobs` es la bitácora de cada intento de generación.
 * Separarlas permite reintentar y regenerar sin perder el rastro de lo que
 * falló, que es lo que hace depurable un proceso diferido.
 *
 * `blob_url` **no se expone nunca al cliente**. La descarga pasa por una ruta
 * propia que comprueba el tenant, de modo que un documento de un espacio no
 * sea alcanzable desde otro ni aunque alguien tuviera el enlace.
 */
import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { users } from './auth';
import { conversations } from './chat';
import {
  DOCUMENT_FORMATS,
  DOCUMENT_STATUSES,
  DOCUMENT_TYPES,
} from '../../documents/types';

export const documentTypeEnum = pgEnum('document_type', DOCUMENT_TYPES);
export const documentFormatEnum = pgEnum('document_format', DOCUMENT_FORMATS);
export const documentStatusEnum = pgEnum('document_status', DOCUMENT_STATUSES);

export const documents = pgTable(
  'documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Si la conversación se borra, el documento sobrevive: es un entregable
    // por derecho propio, no un anexo de la charla que lo originó.
    conversationId: uuid('conversation_id').references(() => conversations.id, {
      onDelete: 'set null',
    }),
    type: documentTypeEnum('type').notNull(),
    title: text('title').notNull(),
    format: documentFormatEnum('format').notNull(),
    status: documentStatusEnum('status').notNull().default('pending'),
    blobUrl: text('blob_url'),
    /** Ruta dentro del store, necesaria para borrar el archivo después. */
    blobPathname: text('blob_pathname'),
    sizeBytes: integer('size_bytes'),
    folio: text('folio').notNull(),
    /** El contenido con el que se generó, para poder regenerar. */
    sourceContent: text('source_content').notNull(),
    /** Instrucciones de la última regeneración, si las hubo. */
    revisionNote: text('revision_note'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('documents_tenant_id_idx').on(table.tenantId),
    index('documents_tenant_user_recent_idx').on(
      table.tenantId,
      table.userId,
      table.createdAt,
    ),
    uniqueIndex('documents_tenant_folio_uq').on(table.tenantId, table.folio),
  ],
);

export const documentJobs = pgTable(
  'document_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    status: documentStatusEnum('status').notNull().default('pending'),
    /** Mensaje técnico del fallo. Nunca se muestra tal cual (regla 3.6). */
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    index('document_jobs_tenant_id_idx').on(table.tenantId),
    index('document_jobs_document_idx').on(table.tenantId, table.documentId),
  ],
);

export type DocumentRow = typeof documents.$inferSelect;
export type DocumentJobRow = typeof documentJobs.$inferSelect;
