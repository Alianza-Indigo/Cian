/**
 * Bitacora de auditoria.
 *
 * Regla 3.6: ningun dato clinico entra aqui. `metadata` guarda identificadores
 * y nombres de accion, nunca contenido de conversaciones, notas ni informacion
 * de salud. Ver `lib/db/repositories/audit.ts`, que sanea antes de escribir.
 */
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { users } from './auth';

export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    entity: text('entity').notNull(),
    entityId: text('entity_id'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('audit_log_tenant_id_idx').on(table.tenantId),
    index('audit_log_tenant_created_idx').on(table.tenantId, table.createdAt),
  ],
);

export type AuditLogRow = typeof auditLog.$inferSelect;
