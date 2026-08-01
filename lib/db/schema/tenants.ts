/**
 * Multi-tenancy. Ver regla 3.1 del PRD.
 *
 * Cada persona que entra por primera vez recibe un tenant personal propio del
 * que es `owner`. Las organizaciones son el mismo tipo de fila con mas de un
 * miembro. Por eso no existen dos modelos distintos: solo `tenants` y
 * `tenant_members`.
 */
import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './auth';

/** Rol dentro de un tenant. Coincide con `TenantContext['role']`. */
export const memberRoleEnum = pgEnum('member_role', [
  'owner',
  'admin',
  'professional',
  'member',
]);

export const memberStatusEnum = pgEnum('member_status', [
  'invited',
  'active',
  'suspended',
]);

/** Plan contratado. Stripe entra hasta la Fase 9; aqui solo se registra. */
export const tenantPlanEnum = pgEnum('tenant_plan', [
  'free',
  'personal',
  'organization',
]);

export type TenantSettings = {
  /** Nombre visible de la organizacion en documentos generados. */
  displayName?: string;
  /** Zona horaria IANA usada para recordatorios y agendas. */
  timezone?: string;
};

export const tenants = pgTable(
  'tenants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    plan: tenantPlanEnum('plan').notNull().default('free'),
    settings: jsonb('settings').$type<TenantSettings>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex('tenants_slug_uq').on(table.slug)],
);

export const tenantMembers = pgTable(
  'tenant_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: memberRoleEnum('role').notNull().default('member'),
    status: memberStatusEnum('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('tenant_members_tenant_id_idx').on(table.tenantId),
    index('tenant_members_user_id_idx').on(table.userId),
    uniqueIndex('tenant_members_tenant_user_uq').on(table.tenantId, table.userId),
  ],
);

export type TenantRow = typeof tenants.$inferSelect;
export type TenantMemberRow = typeof tenantMembers.$inferSelect;
export type MemberRole = TenantMemberRow['role'];
