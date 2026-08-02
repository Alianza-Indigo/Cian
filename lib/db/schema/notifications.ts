/**
 * Recordatorios y notificaciones. Fase 8.
 *
 * Tres tablas: a qué dispositivos se puede llegar, qué hay que recordar y qué
 * pasó con cada intento.
 *
 * `notification_log` no existe para hacer estadística. Existe porque un
 * recordatorio que no llegó es indistinguible de uno que nadie miró, y sin
 * registro no hay forma de responder «¿por qué no me avisó?». Guarda el canal,
 * el resultado y el motivo del fallo; nunca el contenido del mensaje, que
 * puede decir a qué hora se baña una persona.
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
import { tenants } from './tenants';
import { users } from './auth';
import {
  CHANNELS,
  DELIVERY_STATUSES,
  REMINDER_KINDS,
  type Channel,
  type ReminderSchedule,
} from '../../notifications/types';
import type { PushSubscriptionKeys } from '../../notifications/webpush';

export const reminderKindEnum = pgEnum('reminder_kind', REMINDER_KINDS);
export const channelEnum = pgEnum('notification_channel', CHANNELS);
export const deliveryStatusEnum = pgEnum('delivery_status', DELIVERY_STATUSES);

export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** URL del servicio de push. Es el identificador real del dispositivo. */
    endpoint: text('endpoint').notNull(),
    keys: jsonb('keys').$type<PushSubscriptionKeys>().notNull(),
    /** Para que la persona reconozca cuál es cuál al desconectar uno. */
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    /** Última vez que el servicio de push aceptó un envío. */
    lastSuccessAt: timestamp('last_success_at', {
      withTimezone: true,
      mode: 'date',
    }),
  },
  (table) => [
    index('push_subscriptions_tenant_id_idx').on(table.tenantId),
    index('push_subscriptions_user_idx').on(table.tenantId, table.userId),
    // El mismo navegador vuelve a suscribirse con el mismo endpoint: se
    // actualiza la fila en vez de acumular duplicados que envían dos veces.
    uniqueIndex('push_subscriptions_endpoint_uq').on(table.endpoint),
  ],
);

export const reminders = pgTable(
  'reminders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: reminderKindEnum('kind').notNull().default('libre'),
    /** Rutina, tarea o plan al que apunta. Null en los sueltos. */
    resourceId: uuid('resource_id'),
    title: text('title').notNull(),
    /** Lo que se lee en la notificación. Corto. */
    body: text('body'),
    schedule: jsonb('schedule').$type<ReminderSchedule>().notNull(),
    channels: jsonb('channels').$type<Channel[]>().notNull().default([]),
    active: boolean('active').notNull().default(true),
    lastSentAt: timestamp('last_sent_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('reminders_tenant_id_idx').on(table.tenantId),
    // El barrido del cron lee por esta columna y cruza todos los tenants.
    index('reminders_active_idx').on(table.active),
  ],
);

export const notificationLog = pgTable(
  'notification_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    reminderId: uuid('reminder_id').references(() => reminders.id, {
      onDelete: 'set null',
    }),
    channel: channelEnum('channel').notNull(),
    status: deliveryStatusEnum('status').notNull(),
    /** Motivo del fallo o de la omisión. Nunca el contenido del mensaje. */
    error: text('error'),
    sentAt: timestamp('sent_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('notification_log_tenant_id_idx').on(table.tenantId),
    index('notification_log_user_time_idx').on(
      table.tenantId,
      table.userId,
      table.sentAt,
    ),
  ],
);

export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;
export type ReminderRow = typeof reminders.$inferSelect;
export type NotificationLogRow = typeof notificationLog.$inferSelect;
