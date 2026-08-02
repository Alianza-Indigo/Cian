/**
 * Rutinas y sus pasos.
 *
 * Una rutina es una secuencia ordenada. El orden vive en `order_index` y no
 * en el orden de inserción, porque reordenar pasos es una operación de primera
 * clase: la secuencia visual se recorre en ese orden y cambiarlo es parte del
 * uso normal, no una excepción.
 */
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { users } from './auth';
import { conversations } from './chat';
import { ROUTINE_TYPES } from '../../plans/types';

export const routineTypeEnum = pgEnum('routine_type', ROUTINE_TYPES);

export const routines = pgTable(
  'routines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id').references(() => conversations.id, {
      onDelete: 'set null',
    }),
    type: routineTypeEnum('type').notNull().default('matutina'),
    title: text('title').notNull(),
    description: text('description'),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('routines_tenant_id_idx').on(table.tenantId),
    index('routines_tenant_user_recent_idx').on(
      table.tenantId,
      table.userId,
      table.updatedAt,
    ),
  ],
);

export const routineSteps = pgTable(
  'routine_steps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    routineId: uuid('routine_id')
      .notNull()
      .references(() => routines.id, { onDelete: 'cascade' }),
    orderIndex: integer('order_index').notNull().default(0),
    title: text('title').notNull(),
    /** Estimación, no cronómetro: la secuencia avanza a mano (regla 3.7). */
    durationSeconds: integer('duration_seconds'),
    /** Emoji o símbolo corto. Las imágenes llegan con los adjuntos, Fase 4. */
    icon: text('icon'),
    imageUrl: text('image_url'),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('routine_steps_tenant_id_idx').on(table.tenantId),
    index('routine_steps_routine_order_idx').on(
      table.tenantId,
      table.routineId,
      table.orderIndex,
    ),
  ],
);

export const routineLogs = pgTable(
  'routine_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    routineId: uuid('routine_id')
      .notNull()
      .references(() => routines.id, { onDelete: 'cascade' }),
    /**
     * Identificadores de los pasos completados. Se guarda la lista y no un
     * contador para que un paso que siempre se salta sea visible.
     */
    completedSteps: jsonb('completed_steps').$type<string[]>().notNull().default([]),
    note: text('note'),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('routine_logs_tenant_id_idx').on(table.tenantId),
    index('routine_logs_routine_time_idx').on(
      table.tenantId,
      table.routineId,
      table.completedAt,
    ),
  ],
);

export type RoutineRow = typeof routines.$inferSelect;
export type RoutineStepRow = typeof routineSteps.$inferSelect;
export type RoutineLogRow = typeof routineLogs.$inferSelect;
