/**
 * Los tres módulos de vida diaria de la Fase 5.
 *
 * Van juntos porque comparten patrón: perfil + registro + estrategias. Lo que
 * cambia es el dominio, no la forma.
 *
 * Aviso sobre `food_profiles`: es la tabla más delicada del sistema hasta
 * ahora. Guarda qué come y qué rechaza una persona, y ese dato colinda con los
 * trastornos de la conducta alimentaria. Ninguna columna admite cifras a
 * propósito, y `lib/nutrition/guardrail.ts` comprueba el contenido antes de
 * guardarlo (regla 3.6).
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
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { users } from './auth';
import {
  EVENT_OUTCOMES,
  SENSITIVITY_LEVELS,
  SENSORY_DOMAINS,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from '../../sensory/types';
import type {
  FoodTextureNote,
  MealPlanContent,
  ShoppingItem,
} from '../../nutrition/types';

// --- Sensorialidad ----------------------------------------------------------

export const sensoryDomainEnum = pgEnum('sensory_domain', SENSORY_DOMAINS);
export const sensitivityEnum = pgEnum('sensory_sensitivity', SENSITIVITY_LEVELS);
export const eventOutcomeEnum = pgEnum('sensory_outcome', EVENT_OUTCOMES);

export const sensoryProfiles = pgTable(
  'sensory_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    domain: sensoryDomainEnum('domain').notNull(),
    sensitivity: sensitivityEnum('sensitivity').notNull().default('sin_dificultad'),
    triggers: jsonb('triggers').$type<string[]>().notNull().default([]),
    strategies: jsonb('strategies').$type<string[]>().notNull().default([]),
    notes: text('notes'),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('sensory_profiles_tenant_id_idx').on(table.tenantId),
    // Un perfil por dominio y por persona: actualizar, nunca duplicar.
    uniqueIndex('sensory_profiles_tenant_user_domain_uq').on(
      table.tenantId,
      table.userId,
      table.domain,
    ),
  ],
);

export const sensoryEvents = pgTable(
  'sensory_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    domain: sensoryDomainEnum('domain').notNull(),
    /** Del 1 al 5: cómo se vivió, no una medición. */
    intensity: integer('intensity'),
    context: text('context'),
    strategyUsed: text('strategy_used'),
    outcome: eventOutcomeEnum('outcome'),
    occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('sensory_events_tenant_id_idx').on(table.tenantId),
    index('sensory_events_tenant_time_idx').on(
      table.tenantId,
      table.userId,
      table.occurredAt,
    ),
  ],
);

export const sensoryTools = pgTable(
  'sensory_tools',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    domain: sensoryDomainEnum('domain'),
    /** Si a esta persona le funciona. Null mientras no se sepa. */
    effective: boolean('effective'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('sensory_tools_tenant_id_idx').on(table.tenantId)],
);

// --- Funciones ejecutivas ---------------------------------------------------

export const taskStatusEnum = pgEnum('task_status', TASK_STATUSES);
export const taskPriorityEnum = pgEnum('task_priority', TASK_PRIORITIES);

export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Autorreferencia: una subtarea apunta a su tarea madre.
    parentTaskId: uuid('parent_task_id'),
    title: text('title').notNull(),
    notes: text('notes'),
    priority: taskPriorityEnum('priority').notNull().default('media'),
    estimatedMinutes: integer('estimated_minutes'),
    status: taskStatusEnum('status').notNull().default('pendiente'),
    orderIndex: integer('order_index').notNull().default(0),
    dueAt: timestamp('due_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    index('tasks_tenant_id_idx').on(table.tenantId),
    index('tasks_tenant_user_status_idx').on(
      table.tenantId,
      table.userId,
      table.status,
    ),
    index('tasks_parent_idx').on(table.tenantId, table.parentTaskId),
  ],
);

// --- Alimentación -----------------------------------------------------------

export const foodProfiles = pgTable(
  'food_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Lo que come sin problema. Nombres de alimentos, nunca cantidades. */
    accepted: jsonb('accepted').$type<string[]>().notNull().default([]),
    /** Lo que rechaza. No es una lista de prohibiciones: es información. */
    avoided: jsonb('avoided').$type<string[]>().notNull().default([]),
    textures: jsonb('textures').$type<FoodTextureNote[]>().notNull().default([]),
    notes: text('notes'),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('food_profiles_tenant_id_idx').on(table.tenantId),
    uniqueIndex('food_profiles_tenant_user_uq').on(table.tenantId, table.userId),
  ],
);

export const mealPlans = pgTable(
  'meal_plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Lunes de la semana, en formato ISO corto: `2026-08-03`. */
    weekStart: text('week_start').notNull(),
    plan: jsonb('plan').$type<MealPlanContent>().notNull().default({}),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('meal_plans_tenant_id_idx').on(table.tenantId),
    uniqueIndex('meal_plans_tenant_user_week_uq').on(
      table.tenantId,
      table.userId,
      table.weekStart,
    ),
  ],
);

export const shoppingLists = pgTable(
  'shopping_lists',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    mealPlanId: uuid('meal_plan_id')
      .notNull()
      .references(() => mealPlans.id, { onDelete: 'cascade' }),
    items: jsonb('items').$type<ShoppingItem[]>().notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('shopping_lists_tenant_id_idx').on(table.tenantId),
    index('shopping_lists_plan_idx').on(table.tenantId, table.mealPlanId),
  ],
);

export type SensoryProfileRow = typeof sensoryProfiles.$inferSelect;
export type SensoryEventRow = typeof sensoryEvents.$inferSelect;
export type SensoryToolRow = typeof sensoryTools.$inferSelect;
export type TaskRow = typeof tasks.$inferSelect;
export type FoodProfileRow = typeof foodProfiles.$inferSelect;
export type MealPlanRow = typeof mealPlans.$inferSelect;
export type ShoppingListRow = typeof shoppingLists.$inferSelect;
