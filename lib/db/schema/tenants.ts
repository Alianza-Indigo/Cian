/**
 * Multi-tenancy. Ver regla 3.1 del PRD.
 *
 * Cada persona que entra por primera vez recibe un tenant personal propio del
 * que es `owner`. Las organizaciones son el mismo tipo de fila con mas de un
 * miembro. Por eso no existen dos modelos distintos: solo `tenants` y
 * `tenant_members`.
 */
import {
  boolean,
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
import type { PlanLimits } from '../../billing/types';

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

    /*
     * --- Concesión de plataforma --------------------------------------------
     *
     * Capacidad regalada a un espacio desde la administración de plataforma,
     * sin pasar por Stripe: una asociación a la que se le abre el plan de
     * organización, una escuela a la que se le suben los asientos durante un
     * curso, un espacio en pruebas.
     *
     * **Por qué son columnas aparte y no se escribe en `plan` directamente.**
     * `syncSubscriptionFromStripe` reescribe `tenants.plan` en cada webhook y
     * en cada pasada del cron de reconciliación. Una concesión guardada ahí
     * desaparecería sola la próxima vez que Stripe dijera cualquier cosa, sin
     * error y sin aviso, y el espacio perdería lo que se le concedió sin que
     * nadie se enterara. Guardada aquí, sobrevive.
     *
     * Por omisión la concesión **solo suma**: se aplica cuando es más generosa
     * que el plan pagado, nunca cuando es menor. Así, un descuido en esta
     * pantalla no puede quitarle a nadie lo que está pagando.
     *
     * `platform_override` levanta esa red. Con él, lo concedido **sustituye** a
     * lo que se paga, también hacia abajo. Existe porque la plataforma tiene que
     * poder contener un espacio que está haciendo daño sin esperar a que un
     * cobro se cancele en Stripe. No es el modo por omisión y la pantalla lo
     * pide aparte, porque activarlo sin querer sí puede quitarle a alguien lo
     * que compró.
     */
    platformPlan: tenantPlanEnum('platform_plan'),
    platformLimits: jsonb('platform_limits').$type<Partial<PlanLimits>>(),
    platformOverride: boolean('platform_override').notNull().default(false),
    /** Por qué se concedió. Lo lee quien venga después a preguntarse por qué. */
    platformNote: text('platform_note'),
    platformGrantedAt: timestamp('platform_granted_at', {
      withTimezone: true,
      mode: 'date',
    }),
    platformGrantedBy: text('platform_granted_by').references(() => users.id, {
      onDelete: 'set null',
    }),

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
