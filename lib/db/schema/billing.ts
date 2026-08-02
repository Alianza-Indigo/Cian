/**
 * Membresías y configuración de modelos. Fase 9.
 *
 * ## Stripe es la fuente de verdad del cobro, no de la aplicación
 *
 * `subscriptions` es un **espejo** de lo que Stripe dice, actualizado por
 * webhook. La aplicación nunca pregunta a Stripe para decidir si alguien tiene
 * acceso: lee esta tabla. Consultar la API en cada petición ataría cada
 * pantalla a la disponibilidad de un tercero, y una caída de Stripe dejaría a
 * las familias sin sus planes de apoyo.
 *
 * El precio de esa decisión es la deriva: si un webhook se pierde, la tabla
 * queda desactualizada. Se acepta a propósito, porque el error cae del lado
 * generoso —alguien conserva acceso que ya no pagó— y no del lado que le quita
 * herramientas a quien las está usando.
 */
import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import {
  BILLING_CYCLES,
  MODEL_PURPOSES,
  PLANS,
  SUBSCRIPTION_STATUSES,
  type PlanLimits,
} from '../../billing/types';

export const billingPlanEnum = pgEnum('billing_plan', PLANS);
export const billingCycleEnum = pgEnum('billing_cycle', BILLING_CYCLES);
export const subscriptionStatusEnum = pgEnum(
  'subscription_status',
  SUBSCRIPTION_STATUSES,
);
export const modelPurposeEnum = pgEnum('model_purpose', MODEL_PURPOSES);

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    stripeCustomerId: text('stripe_customer_id'),
    stripeSubscriptionId: text('stripe_subscription_id'),
    plan: billingPlanEnum('plan').notNull().default('free'),
    cycle: billingCycleEnum('cycle'),
    status: subscriptionStatusEnum('status').notNull().default('incompleta'),
    seats: integer('seats').notNull().default(1),
    currentPeriodEnd: timestamp('current_period_end', {
      withTimezone: true,
      mode: 'date',
    }),
    /** Stripe avisa de la baja programada antes de que ocurra. */
    cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Una suscripción por tenant. Cambiar de plan actualiza la fila.
    uniqueIndex('subscriptions_tenant_uq').on(table.tenantId),
    index('subscriptions_stripe_sub_idx').on(table.stripeSubscriptionId),
    index('subscriptions_stripe_customer_idx').on(table.stripeCustomerId),
  ],
);

/**
 * Límites por plan, editables desde el panel.
 *
 * Es una tabla y no una constante para poder ampliar el plan gratuito —o
 * apretarlo— sin desplegar. Los valores del código en
 * `lib/billing/types.ts` siguen siendo el respaldo: una fila incompleta no
 * deja campos sin límite, los rellena `resolveLimits`.
 */
export const planLimits = pgTable(
  'plan_limits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    plan: billingPlanEnum('plan').notNull(),
    limits: jsonb('limits').$type<Partial<PlanLimits>>().notNull().default({}),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex('plan_limits_plan_uq').on(table.plan)],
);

/**
 * Qué modelo usa cada tenant para cada propósito.
 *
 * `tenant_id` admite `NULL` y ese `NULL` es el valor global de la plataforma,
 * igual que en la biblioteca. Así se puede cambiar el modelo de todo CIAN
 * desde el panel, y afinarlo para un tenant concreto cuando haga falta.
 */
export const modelConfigs = pgTable(
  'model_configs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, {
      onDelete: 'cascade',
    }),
    purpose: modelPurposeEnum('purpose').notNull(),
    provider: text('provider').notNull().default('google'),
    model: text('model').notNull(),
    params: jsonb('params').$type<Record<string, unknown>>().notNull().default({}),
    active: boolean('active').notNull().default(true),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('model_configs_tenant_idx').on(table.tenantId),
    // Una configuración por tenant y propósito. El global va aparte porque
    // Postgres no considera iguales dos NULL en un índice único.
    uniqueIndex('model_configs_tenant_purpose_uq').on(table.tenantId, table.purpose),
    uniqueIndex('model_configs_global_purpose_uq')
      .on(table.purpose)
      .where(sql`tenant_id is null`),
  ],
);

export type SubscriptionRow = typeof subscriptions.$inferSelect;
export type PlanLimitsRow = typeof planLimits.$inferSelect;
export type ModelConfigRow = typeof modelConfigs.$inferSelect;
