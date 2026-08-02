/**
 * Biblioteca inteligente y módulo educativo.
 *
 * **La biblioteca es global, no por tenant.** `tenant_id` admite `NULL`, y ese
 * `NULL` significa «contenido de CIAN, visible para todos». Un tenant puede
 * además cargar recursos propios, que solo ve él (criterio de aceptación de la
 * Fase 6).
 *
 * Los fragmentos guardan su `tenant_id` copiado del recurso. Es redundante a
 * propósito: permite filtrar por tenant en la misma consulta vectorial, sin
 * unir tablas dentro de la búsqueda por similitud.
 */
import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { users } from './auth';
import { documents } from './documents';
import {
  EDUCATION_KINDS,
  EMBEDDING_DIMENSIONS,
  LIBRARY_CATEGORIES,
} from '../../library/types';
import type { EducationPayload } from '../../library/types';

export const libraryCategoryEnum = pgEnum('library_category', LIBRARY_CATEGORIES);
export const educationKindEnum = pgEnum('education_kind', EDUCATION_KINDS);

export const libraryResources = pgTable(
  'library_resources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** `NULL` = contenido global de CIAN. */
    tenantId: uuid('tenant_id').references(() => tenants.id, {
      onDelete: 'cascade',
    }),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    category: libraryCategoryEnum('category').notNull(),
    tags: jsonb('tags').$type<string[]>().notNull().default([]),
    source: text('source'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true, mode: 'date' }),
    content: text('content').notNull(),
    /**
     * Huella del contenido. Permite saltarse el reindexado —y el costo de los
     * embeddings— cuando un recurso no cambió.
     */
    contentHash: text('content_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    /*
     * El `slug` es único **dentro de su ámbito**, no en toda la tabla.
     *
     * Antes lo era en toda la tabla, y eso era un fallo con dientes: en cuanto
     * un espacio pudiera publicar contenido propio, un recurso suyo llamado
     * `rutinas-manana` habría sobrescrito el global de CIAN con ese nombre —el
     * `upsert` resuelve el conflicto por `slug`— y todos los demás espacios
     * habrían empezado a leer el texto de ese uno.
     *
     * Son dos índices parciales y no uno de `(tenant_id, slug)` porque en
     * Postgres dos `NULL` no chocan entre sí: con un índice compuesto, dos
     * recursos globales con el mismo slug pasarían sin protestar.
     */
    uniqueIndex('library_resources_global_slug_uq')
      .on(table.slug)
      .where(sql`${table.tenantId} is null`),
    uniqueIndex('library_resources_tenant_slug_uq')
      .on(table.tenantId, table.slug)
      .where(sql`${table.tenantId} is not null`),
    index('library_resources_category_idx').on(table.category),
    index('library_resources_tenant_idx').on(table.tenantId),
  ],
);

export const libraryChunks = pgTable(
  'library_chunks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    resourceId: uuid('resource_id')
      .notNull()
      .references(() => libraryResources.id, { onDelete: 'cascade' }),
    /** Copiado del recurso para poder filtrar dentro de la búsqueda vectorial. */
    tenantId: uuid('tenant_id').references(() => tenants.id, {
      onDelete: 'cascade',
    }),
    chunkIndex: integer('chunk_index').notNull(),
    content: text('content').notNull(),
    embedding: vector('embedding', { dimensions: EMBEDDING_DIMENSIONS }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('library_chunks_resource_idx').on(table.resourceId),
    index('library_chunks_tenant_idx').on(table.tenantId),
    // HNSW sobre distancia coseno: es lo que sostiene el criterio de los 500 ms.
    index('library_chunks_embedding_idx').using(
      'hnsw',
      table.embedding.op('vector_cosine_ops'),
    ),
  ],
);

export const educationItems = pgTable(
  'education_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: educationKindEnum('kind').notNull(),
    title: text('title').notNull(),
    payload: jsonb('payload').$type<EducationPayload>().notNull().default({}),
    /** Si se exportó a documento, aquí queda el enlace. */
    documentId: uuid('document_id').references(() => documents.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('education_items_tenant_id_idx').on(table.tenantId),
    index('education_items_tenant_user_recent_idx').on(
      table.tenantId,
      table.userId,
      table.createdAt,
    ),
  ],
);

export type LibraryResourceRow = typeof libraryResources.$inferSelect;
export type LibraryChunkRow = typeof libraryChunks.$inferSelect;
export type EducationItemRow = typeof educationItems.$inferSelect;
