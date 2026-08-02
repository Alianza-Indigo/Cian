/**
 * El barrido de recordatorios. Fase 8.
 *
 * Lo llama el cron cada `SWEEP_MINUTES`. La decisión de a quién le toca vive
 * en `schedule.ts`, que es puro y está probado; aquí solo queda el orden de
 * los intentos y qué se registra.
 *
 * ## El orden importa
 *
 * 1. ¿Toca ahora? Si no, se acabó, sin escribir nada.
 * 2. ¿Estamos en horas de silencio? Si sí, se registra como omitido y **se
 *    marca como enviado**. Esto último es lo que evita que el recordatorio
 *    salte en cuanto termine el silencio: nadie quiere una notificación de la
 *    rutina matutina a las siete de la tarde.
 * 3. Push a cada dispositivo. Si el servicio dice que la suscripción ya no
 *    existe, se borra la fila en vez de reintentarla cada quince minutos.
 * 4. Correo solo si el push **no llegó a ningún dispositivo**. El respaldo es
 *    respaldo: recibir el mismo aviso dos veces por dos vías es ruido.
 */
import {
  isDue,
  localPartsIn,
} from './schedule';
import { isQuietHour } from './schedule';
import { reminderEmail, sendEmail } from './email';
import { sendPush, vapidFromEnv, type VapidKeys } from './webpush';
import type { Channel } from './types';
import {
  dropDeadSubscription,
  logDelivery,
  markReminderSent,
  markSubscriptionDelivered,
  subscriptionsForUser,
  type SweepCandidate,
} from '../db/repositories/notifications';

export type SweepSummary = {
  revisados: number;
  disparados: number;
  omitidosPorSilencio: number;
  pushEnviados: number;
  pushFallidos: number;
  correosEnviados: number;
  suscripcionesBorradas: number;
  sinVapid: boolean;
};

function emptySummary(): SweepSummary {
  return {
    revisados: 0,
    disparados: 0,
    omitidosPorSilencio: 0,
    pushEnviados: 0,
    pushFallidos: 0,
    correosEnviados: 0,
    suscripcionesBorradas: 0,
    sinVapid: false,
  };
}

/** Lo que viaja al service worker. Corto: hay un techo de 4 KB. */
function pushPayload(title: string, body: string | null, url: string): string {
  return JSON.stringify({ title, body: body ?? '', url });
}

async function deliverPush(
  candidate: SweepCandidate,
  vapid: VapidKeys,
  summary: SweepSummary,
): Promise<boolean> {
  const { reminder } = candidate;
  const subscriptions = await subscriptionsForUser(
    reminder.tenantId,
    reminder.userId,
  );

  if (subscriptions.length === 0) {
    await logDelivery({
      tenantId: reminder.tenantId,
      userId: reminder.userId,
      reminderId: reminder.id,
      channel: 'push',
      status: 'omitido',
      error: 'No hay dispositivos suscritos.',
    });
    return false;
  }

  const payload = pushPayload(reminder.title, reminder.body, '/');
  let anyDelivered = false;

  for (const subscription of subscriptions) {
    const result = await sendPush(
      { endpoint: subscription.endpoint, keys: subscription.keys },
      payload,
      vapid,
    );

    if (result.ok) {
      anyDelivered = true;
      summary.pushEnviados += 1;
      await markSubscriptionDelivered(subscription.endpoint);
      continue;
    }

    summary.pushFallidos += 1;

    if (result.gone) {
      summary.suscripcionesBorradas += 1;
      await dropDeadSubscription(subscription.endpoint);
    }

    await logDelivery({
      tenantId: reminder.tenantId,
      userId: reminder.userId,
      reminderId: reminder.id,
      channel: 'push',
      status: 'fallido',
      error: result.error,
    });
  }

  if (anyDelivered) {
    await logDelivery({
      tenantId: reminder.tenantId,
      userId: reminder.userId,
      reminderId: reminder.id,
      channel: 'push',
      status: 'enviado',
    });
  }

  return anyDelivered;
}

async function deliverEmail(
  candidate: SweepCandidate,
  summary: SweepSummary,
): Promise<void> {
  const { reminder, email } = candidate;

  if (!email) {
    await logDelivery({
      tenantId: reminder.tenantId,
      userId: reminder.userId,
      reminderId: reminder.id,
      channel: 'correo',
      status: 'omitido',
      error: 'La cuenta no tiene correo.',
    });
    return;
  }

  const result = await sendEmail(
    reminderEmail({ to: email, title: reminder.title, body: reminder.body }),
  );

  if (result.ok) {
    summary.correosEnviados += 1;
    await logDelivery({
      tenantId: reminder.tenantId,
      userId: reminder.userId,
      reminderId: reminder.id,
      channel: 'correo',
      status: 'enviado',
    });
    return;
  }

  await logDelivery({
    tenantId: reminder.tenantId,
    userId: reminder.userId,
    reminderId: reminder.id,
    channel: 'correo',
    status: result.configured ? 'fallido' : 'omitido',
    error: result.error,
  });
}

export async function runSweep(
  candidates: SweepCandidate[],
  now: Date,
): Promise<SweepSummary> {
  const summary = emptySummary();
  summary.revisados = candidates.length;

  const vapid = vapidFromEnv();
  summary.sinVapid = vapid === null;

  for (const candidate of candidates) {
    const { reminder, preferences } = candidate;

    const verdict = isDue(
      {
        schedule: reminder.schedule,
        active: reminder.active,
        lastSentAt: reminder.lastSentAt,
      },
      now,
    );

    if (!verdict.due) continue;

    summary.disparados += 1;

    const local = localPartsIn(now, reminder.schedule.timeZone);
    if (isQuietHour(local.hour, preferences.quietHours)) {
      summary.omitidosPorSilencio += 1;
      await logDelivery({
        tenantId: reminder.tenantId,
        userId: reminder.userId,
        reminderId: reminder.id,
        channel: 'push',
        status: 'omitido',
        error: 'En horas de silencio.',
      });
      // Marcar como enviado es lo que impide que salte al terminar el silencio.
      await markReminderSent(reminder.id, now);
      continue;
    }

    /*
     * Los canales del recordatorio mandan sobre las preferencias generales:
     * quien crea un recordatorio decide por dónde quiere ese en concreto. Si no
     * eligió ninguno, se usan los de sus preferencias.
     */
    const channels: Channel[] =
      reminder.channels.length > 0 ? reminder.channels : preferences.channels;

    let pushDelivered = false;

    if (channels.includes('push')) {
      if (vapid) {
        pushDelivered = await deliverPush(candidate, vapid, summary);
      } else {
        await logDelivery({
          tenantId: reminder.tenantId,
          userId: reminder.userId,
          reminderId: reminder.id,
          channel: 'push',
          status: 'omitido',
          error: 'Faltan las claves VAPID en el entorno.',
        });
      }
    }

    // Respaldo: solo si el push no llegó a ningún lado.
    if (channels.includes('correo') && !pushDelivered) {
      await deliverEmail(candidate, summary);
    }

    await markReminderSent(reminder.id, now);
  }

  return summary;
}
