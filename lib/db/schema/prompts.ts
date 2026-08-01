/**
 * Prompts versionados. Ver regla 3.5 del PRD.
 *
 * Los system prompts NO viven en el codigo. El codigo los lee por `key` y se
 * queda con la version activa. Editarlos desde el panel administrativo
 * (Fase 9) cambia el comportamiento del asistente sin redeploy.
 *
 * La tabla es global a la plataforma, no por tenant: son contenido operativo
 * de CIAN, no datos de las personas usuarias.
 */
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const prompts = pgTable(
  'prompts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').notNull(),
    version: integer('version').notNull().default(1),
    content: text('content').notNull(),
    isActive: boolean('is_active').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('prompts_key_version_uq').on(table.key, table.version),
    index('prompts_key_idx').on(table.key),
  ],
);

export type PromptRow = typeof prompts.$inferSelect;
