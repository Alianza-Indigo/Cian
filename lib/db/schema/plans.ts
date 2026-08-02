/**
 * Planes de apoyo.
 *
 * Estructura del PRD: objetivos → estrategias → indicadores de seguimiento.
 * Son tres tablas y no un `jsonb` a propósito: la persona debe poder editar
 * un objetivo suelto sin reescribir el plan, y el seguimiento se consulta por
 * objetivo a lo largo del tiempo.
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
import { conversations } from './chat';
import {
  OBJECTIVE_STATUSES,
  PLAN_STATUSES,
  PLAN_TYPES,
} from '../../plans/types';

export const planTypeEnum = pgEnum('plan_type', PLAN_TYPES);
export const planStatusEnum = pgEnum('plan_status', PLAN_STATUSES);
export const objectiveStatusEnum = pgEnum('objective_status', OBJECTIVE_STATUSES);

export const plans = pgTable(
  'plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // De dónde salió. Si la conversación se borra, el plan sobrevive.
    conversationId: uuid('conversation_id').references(() => conversations.id, {
      onDelete: 'set null',
    }),
    type: planTypeEnum('type').notNull().default('personalizado'),
    title: text('title').notNull(),
    description: text('description'),
    status: planStatusEnum('status').notNull().default('activo'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('plans_tenant_id_idx').on(table.tenantId),
    index('plans_tenant_user_recent_idx').on(
      table.tenantId,
      table.userId,
      table.updatedAt,
    ),
  ],
);

export const planObjectives = pgTable(
  'plan_objectives',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    planId: uuid('plan_id')
      .notNull()
      .references(() => plans.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    orderIndex: integer('order_index').notNull().default(0),
    status: objectiveStatusEnum('status').notNull().default('pendiente'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('plan_objectives_tenant_id_idx').on(table.tenantId),
    index('plan_objectives_plan_order_idx').on(
      table.tenantId,
      table.planId,
      table.orderIndex,
    ),
  ],
);

export const planStrategies = pgTable(
  'plan_strategies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    objectiveId: uuid('objective_id')
      .notNull()
      .references(() => planObjectives.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    orderIndex: integer('order_index').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('plan_strategies_tenant_id_idx').on(table.tenantId),
    index('plan_strategies_objective_order_idx').on(
      table.tenantId,
      table.objectiveId,
      table.orderIndex,
    ),
  ],
);

export const planProgress = pgTable(
  'plan_progress',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    planId: uuid('plan_id')
      .notNull()
      .references(() => plans.id, { onDelete: 'cascade' }),
    // El avance puede ser del plan entero o de un objetivo concreto.
    objectiveId: uuid('objective_id').references(() => planObjectives.id, {
      onDelete: 'cascade',
    }),
    note: text('note'),
    /** Valoración de 1 a 5. Sin escala clínica: es cómo lo vivió la persona. */
    rating: integer('rating'),
    loggedAt: timestamp('logged_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('plan_progress_tenant_id_idx').on(table.tenantId),
    index('plan_progress_plan_time_idx').on(
      table.tenantId,
      table.planId,
      table.loggedAt,
    ),
  ],
);

export type PlanRow = typeof plans.$inferSelect;
export type PlanObjectiveRow = typeof planObjectives.$inferSelect;
export type PlanStrategyRow = typeof planStrategies.$inferSelect;
export type PlanProgressRow = typeof planProgress.$inferSelect;
