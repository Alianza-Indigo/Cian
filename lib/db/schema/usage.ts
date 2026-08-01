/**
 * Consumo de modelo por tenant.
 *
 * Alimenta las métricas y los límites de plan de la Fase 9. Aquí no entra
 * contenido de ninguna conversación: solo cuántos tokens, de qué modelo y para
 * qué (regla 3.6).
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

/** Para qué se gastó el modelo. Crecerá conforme entren más fases. */
export const usageKindEnum = pgEnum('usage_kind', [
  'chat',
  'title',
  'summary',
]);

export const usageEvents = pgTable(
  'usage_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    kind: usageKindEnum('kind').notNull(),
    model: text('model').notNull(),
    tokensIn: integer('tokens_in').notNull().default(0),
    tokensOut: integer('tokens_out').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('usage_events_tenant_id_idx').on(table.tenantId),
    index('usage_events_tenant_created_idx').on(table.tenantId, table.createdAt),
  ],
);

export type UsageEventRow = typeof usageEvents.$inferSelect;
