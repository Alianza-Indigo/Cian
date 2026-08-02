/**
 * Crisis no emergentes. Fase 7.
 *
 * Dos tablas: lo que pasó (`crisis_events`) y lo que se acordó hacer la
 * próxima vez (`crisis_protocols`).
 *
 * Sobre la privacidad, que aquí no es un detalle: `crisis_events` guarda lo
 * que la persona decide registrar después del episodio, no la conversación.
 * Cuando la escalera de derivación se dispara se anota la **categoría** de la
 * señal —ideación, riesgo a otra persona, emergencia médica— y nunca el texto
 * que la disparó. La regla 3.5 del PRD pide que ningún dato clínico salga en
 * logs; esta tabla es lo más cerca que CIAN está de tener uno.
 */
import {
  boolean,
  index,
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
import { plans } from './plans';
import { CRISIS_OUTCOMES, CRISIS_SEVERITIES } from '../../crisis/types';
import type { CrisisAction, CrisisStep } from '../../crisis/types';

export const crisisSeverityEnum = pgEnum('crisis_severity', CRISIS_SEVERITIES);
export const crisisOutcomeEnum = pgEnum('crisis_outcome', CRISIS_OUTCOMES);

export const crisisEvents = pgTable(
  'crisis_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // De dónde salió. Si la conversación se borra, la bitácora sobrevive.
    conversationId: uuid('conversation_id').references(() => conversations.id, {
      onDelete: 'set null',
    }),
    severity: crisisSeverityEnum('severity').notNull().default('moderada'),
    /** Qué pasó, en palabras de la persona. Se llena al registrar, no antes. */
    summary: text('summary'),
    triggers: jsonb('triggers').$type<string[]>().notNull().default([]),
    actionsTaken: jsonb('actions_taken')
      .$type<CrisisAction[]>()
      .notNull()
      .default([]),
    outcome: crisisOutcomeEnum('outcome'),
    /** Verdadero cuando se disparó la escalera de derivación. */
    escalated: boolean('escalated').notNull().default(false),
    /**
     * Categorías de la señal que disparó la escalera. Nunca el mensaje.
     * Existe para poder responder «¿esto ya había pasado?» sin conservar el
     * peor momento de alguien escrito en una tabla.
     */
    escalationSignals: jsonb('escalation_signals')
      .$type<string[]>()
      .notNull()
      .default([]),
    /** Plan posterior generado a partir del episodio, si se generó. */
    postPlanId: uuid('post_plan_id').references(() => plans.id, {
      onDelete: 'set null',
    }),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    /** Null mientras el episodio sigue abierto. */
    endedAt: timestamp('ended_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    index('crisis_events_tenant_id_idx').on(table.tenantId),
    index('crisis_events_tenant_time_idx').on(
      table.tenantId,
      table.userId,
      table.startedAt,
    ),
  ],
);

export const crisisProtocols = pgTable(
  'crisis_protocols',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    steps: jsonb('steps').$type<CrisisStep[]>().notNull().default([]),
    /** Un protocolo que dejó de servir se apaga; no se borra el historial. */
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('crisis_protocols_tenant_id_idx').on(table.tenantId)],
);

export type CrisisEventRow = typeof crisisEvents.$inferSelect;
export type CrisisProtocolRow = typeof crisisProtocols.$inferSelect;
