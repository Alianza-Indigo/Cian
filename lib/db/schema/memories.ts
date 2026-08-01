/**
 * Memoria de la persona usuaria.
 *
 * Lo que CIAN recuerda entre conversaciones. Es de las tablas más delicadas
 * del sistema: aquí acaban datos como «le molestan los ruidos fuertes», que
 * son justamente los que la persona debe poder ver, corregir y borrar en
 * cualquier momento (alcance 7 de la Fase 1).
 *
 * `confirmed_by_user` distingue lo que la persona pidió recordar
 * explícitamente de lo que el modelo dedujo por su cuenta.
 */
import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { users } from './auth';
import { messages } from './chat';

export const userMemories = pgTable(
  'user_memories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    value: text('value').notNull(),
    sourceMessageId: uuid('source_message_id').references(() => messages.id, {
      onDelete: 'set null',
    }),
    confirmedByUser: boolean('confirmed_by_user').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('user_memories_tenant_id_idx').on(table.tenantId),
    // Una clave por persona: recordar dos veces lo mismo actualiza, no duplica.
    uniqueIndex('user_memories_tenant_user_key_uq').on(
      table.tenantId,
      table.userId,
      table.key,
    ),
  ],
);

export type UserMemoryRow = typeof userMemories.$inferSelect;
