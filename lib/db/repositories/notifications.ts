import { and, eq, desc, gte, lte } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '../client';
import {
  notificationLog,
  pushSubscriptions,
  reminders,
  type NotificationLogRow,
  type PushSubscriptionRow,
  type ReminderRow,
} from '../schema/notifications';
import { appointments, professionals } from '../schema/consultorio';
import { userPreferences } from '../schema/preferences';
import { users } from '../schema/auth';
import { assertTenantContext, type TenantContext } from '../../tenant/guard';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type Channel,
  type DeliveryStatus,
  type NotificationPreferences,
  type ReminderKind,
  type ReminderSchedule,
} from '../../notifications/types';
import type { PushSubscriptionKeys } from '../../notifications/webpush';

/** Lo que el barrido necesita saber de una cita para decidir si avisa. */
export type AppointmentNoticeCandidate = {
  appointmentId: string;
  tenantId: string;
  scheduledAt: Date;
  status: string;
  noticeSentAt: Date | null;
  clientUserId: string;
  clientEmail: string | null;
  professionalUserId: string;
  professionalName: string | null;
  preferences: NotificationPreferences;
};

// --- Suscripciones de push ---------------------------------------------------

export async function savePushSubscription(
  ctx: TenantContext,
  input: { endpoint: string; keys: PushSubscriptionKeys; userAgent?: string | null },
): Promise<PushSubscriptionRow> {
  assertTenantContext(ctx, 'savePushSubscription');

  const [row] = await db
    .insert(pushSubscriptions)
    .values({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      endpoint: input.endpoint,
      keys: input.keys,
      userAgent: input.userAgent?.slice(0, 300) ?? null,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        // El mismo navegador puede rotar sus claves sin cambiar de endpoint, y
        // puede cambiar de persona si el equipo se comparte. Gana lo último.
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        keys: input.keys,
        userAgent: input.userAgent?.slice(0, 300) ?? null,
      },
    })
    .returning();

  if (!row) throw new Error('No se pudo guardar la suscripción.');
  return row;
}

export async function listPushSubscriptions(
  ctx: TenantContext,
): Promise<PushSubscriptionRow[]> {
  assertTenantContext(ctx, 'listPushSubscriptions');

  return db
    .select()
    .from(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.tenantId, ctx.tenantId),
        eq(pushSubscriptions.userId, ctx.userId),
      ),
    )
    .orderBy(desc(pushSubscriptions.createdAt));
}

export async function deletePushSubscription(
  ctx: TenantContext,
  endpoint: string,
): Promise<void> {
  assertTenantContext(ctx, 'deletePushSubscription');

  await db
    .delete(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.endpoint, endpoint),
        eq(pushSubscriptions.tenantId, ctx.tenantId),
        eq(pushSubscriptions.userId, ctx.userId),
      ),
    );
}

/**
 * Borra una suscripción muerta durante el barrido.
 *
 * Sin `TenantContext` a propósito: la llama el cron, que no actúa en nombre de
 * nadie, y solo puede borrar por `endpoint` —un valor que el propio servicio
 * de push acaba de declarar inexistente—. No lee nada.
 */
export async function dropDeadSubscription(endpoint: string): Promise<void> {
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
}

export async function markSubscriptionDelivered(endpoint: string): Promise<void> {
  await db
    .update(pushSubscriptions)
    .set({ lastSuccessAt: new Date() })
    .where(eq(pushSubscriptions.endpoint, endpoint));
}

// --- Recordatorios -----------------------------------------------------------

export type CreateReminderInput = {
  kind: ReminderKind;
  resourceId?: string | null;
  title: string;
  body?: string | null;
  schedule: ReminderSchedule;
  channels: Channel[];
};

export async function createReminder(
  ctx: TenantContext,
  input: CreateReminderInput,
): Promise<ReminderRow> {
  assertTenantContext(ctx, 'createReminder');

  const title = input.title.trim().slice(0, 200);
  if (title.length === 0) throw new Error('El recordatorio necesita un título.');

  const [row] = await db
    .insert(reminders)
    .values({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      kind: input.kind,
      resourceId: input.resourceId ?? null,
      title,
      body: input.body?.trim().slice(0, 500) || null,
      schedule: input.schedule,
      channels: [...new Set(input.channels)],
    })
    .returning();

  if (!row) throw new Error('No se pudo crear el recordatorio.');
  return row;
}

export async function listReminders(ctx: TenantContext): Promise<ReminderRow[]> {
  assertTenantContext(ctx, 'listReminders');

  return db
    .select()
    .from(reminders)
    .where(
      and(eq(reminders.tenantId, ctx.tenantId), eq(reminders.userId, ctx.userId)),
    )
    .orderBy(desc(reminders.createdAt));
}

export async function setReminderActive(
  ctx: TenantContext,
  reminderId: string,
  active: boolean,
): Promise<void> {
  assertTenantContext(ctx, 'setReminderActive');

  await db
    .update(reminders)
    .set({ active })
    .where(
      and(
        eq(reminders.id, reminderId),
        eq(reminders.tenantId, ctx.tenantId),
        eq(reminders.userId, ctx.userId),
      ),
    );
}

export async function deleteReminder(
  ctx: TenantContext,
  reminderId: string,
): Promise<void> {
  assertTenantContext(ctx, 'deleteReminder');

  await db
    .delete(reminders)
    .where(
      and(
        eq(reminders.id, reminderId),
        eq(reminders.tenantId, ctx.tenantId),
        eq(reminders.userId, ctx.userId),
      ),
    );
}

// --- Lo que necesita el barrido ---------------------------------------------

export type SweepCandidate = {
  reminder: ReminderRow;
  preferences: NotificationPreferences;
  email: string | null;
};

/**
 * Todos los recordatorios activos, de todos los tenants, con lo necesario para
 * decidir y para enviar.
 *
 * **Es la única consulta del sistema que cruza tenants a propósito**, y por eso
 * merece una explicación. La llama el cron, que no actúa en nombre de ninguna
 * persona y por lo tanto no puede tener `TenantContext`: exigirle uno sería
 * inventarse una identidad.
 *
 * Lo que la hace segura no es un filtro, es lo que hace después: cada
 * recordatorio se despacha únicamente a las suscripciones y al correo de su
 * propio `user_id`, tomados de la misma fila. No hay ningún punto donde los
 * datos de un tenant crucen hacia otro.
 *
 * La ruta que la usa está cerrada con `CRON_SECRET`.
 */
export async function listActiveRemindersForSweep(): Promise<SweepCandidate[]> {
  const rows = await db
    .select({
      reminder: reminders,
      preferences: userPreferences.notifications,
      email: users.email,
    })
    .from(reminders)
    .leftJoin(
      userPreferences,
      and(
        eq(userPreferences.userId, reminders.userId),
        eq(userPreferences.tenantId, reminders.tenantId),
      ),
    )
    .leftJoin(users, eq(users.id, reminders.userId))
    .where(eq(reminders.active, true));

  return rows.map((row) => ({
    reminder: row.reminder,
    preferences: row.preferences ?? DEFAULT_NOTIFICATION_PREFERENCES,
    email: row.email,
  }));
}

/**
 * Citas que podrían necesitar aviso hoy.
 *
 * Sin `TenantContext`, como `listActiveRemindersForSweep` y por lo mismo: la
 * llama el cron, que no actúa en nombre de nadie. Devuelve lo mínimo para
 * decidir y redactar el aviso —cuándo, con quién y a qué zona horaria—, nunca
 * el motivo de la consulta, que no tiene por qué salir de la pantalla de la
 * cita ni aparecer en una notificación.
 *
 * La ventana es de dos días para cubrir la víspera y el mismo día en cualquier
 * huso; quién avisa de verdad lo decide `appointmentNotice`.
 */
export async function listAppointmentsForNotice(
  now: Date,
): Promise<AppointmentNoticeCandidate[]> {
  const hasta = new Date(now.getTime() + 2 * 86_400_000);

  const cliente = alias(users, 'cliente');
  const profesionalUser = alias(users, 'profesional_user');

  const rows = await db
    .select({
      appointmentId: appointments.id,
      tenantId: appointments.tenantId,
      scheduledAt: appointments.scheduledAt,
      status: appointments.status,
      noticeSentAt: appointments.noticeSentAt,
      clientUserId: appointments.clientUserId,
      clientEmail: cliente.email,
      clientPreferences: userPreferences.notifications,
      professionalUserId: professionals.userId,
      professionalName: profesionalUser.name,
    })
    .from(appointments)
    .innerJoin(professionals, eq(professionals.id, appointments.professionalId))
    .leftJoin(cliente, eq(cliente.id, appointments.clientUserId))
    .leftJoin(profesionalUser, eq(profesionalUser.id, professionals.userId))
    .leftJoin(
      userPreferences,
      and(
        eq(userPreferences.userId, appointments.clientUserId),
        eq(userPreferences.tenantId, appointments.tenantId),
      ),
    )
    .where(
      and(
        eq(appointments.status, 'confirmada'),
        gte(appointments.scheduledAt, now),
        lte(appointments.scheduledAt, hasta),
      ),
    );

  return rows.map((row) => ({
    ...row,
    preferences: row.clientPreferences ?? DEFAULT_NOTIFICATION_PREFERENCES,
  }));
}

/** Deja constancia de que ya se avisó, para no repetir hoy. */
export async function markAppointmentNoticed(
  appointmentId: string,
  when: Date,
): Promise<void> {
  await db
    .update(appointments)
    .set({ noticeSentAt: when })
    .where(eq(appointments.id, appointmentId));
}

export async function subscriptionsForUser(
  tenantId: string,
  userId: string,
): Promise<PushSubscriptionRow[]> {
  return db
    .select()
    .from(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.tenantId, tenantId),
        eq(pushSubscriptions.userId, userId),
      ),
    );
}

export async function markReminderSent(
  reminderId: string,
  sentAt: Date,
): Promise<void> {
  await db.update(reminders).set({ lastSentAt: sentAt }).where(eq(reminders.id, reminderId));
}

// --- Registro de envíos ------------------------------------------------------

export async function logDelivery(input: {
  tenantId: string;
  userId: string;
  reminderId: string | null;
  channel: Channel;
  status: DeliveryStatus;
  error?: string | null;
}): Promise<void> {
  await db.insert(notificationLog).values({
    tenantId: input.tenantId,
    userId: input.userId,
    reminderId: input.reminderId,
    channel: input.channel,
    status: input.status,
    // El motivo se recorta: los servicios de push devuelven cuerpos largos que
    // a veces traen identificadores del dispositivo.
    error: input.error?.slice(0, 300) ?? null,
  });
}

export async function listDeliveries(
  ctx: TenantContext,
  limit = 30,
): Promise<NotificationLogRow[]> {
  assertTenantContext(ctx, 'listDeliveries');

  return db
    .select()
    .from(notificationLog)
    .where(
      and(
        eq(notificationLog.tenantId, ctx.tenantId),
        eq(notificationLog.userId, ctx.userId),
      ),
    )
    .orderBy(desc(notificationLog.sentAt))
    .limit(Math.min(Math.max(limit, 1), 100));
}

// --- Preferencias ------------------------------------------------------------

export async function getNotificationPreferences(
  ctx: TenantContext,
): Promise<NotificationPreferences> {
  assertTenantContext(ctx, 'getNotificationPreferences');

  const [row] = await db
    .select({ notifications: userPreferences.notifications })
    .from(userPreferences)
    .where(
      and(
        eq(userPreferences.tenantId, ctx.tenantId),
        eq(userPreferences.userId, ctx.userId),
      ),
    )
    .limit(1);

  return row?.notifications ?? DEFAULT_NOTIFICATION_PREFERENCES;
}

export async function saveNotificationPreferences(
  ctx: TenantContext,
  preferences: NotificationPreferences,
): Promise<void> {
  assertTenantContext(ctx, 'saveNotificationPreferences');

  await db
    .insert(userPreferences)
    .values({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      notifications: preferences,
    })
    .onConflictDoUpdate({
      target: [userPreferences.tenantId, userPreferences.userId],
      set: { notifications: preferences, updatedAt: new Date() },
    });
}
