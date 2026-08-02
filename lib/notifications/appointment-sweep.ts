/**
 * Barrido de avisos de cita. Fase 10.
 *
 * Corre pegado al de recordatorios, en el mismo cron diario, porque comparte
 * todo lo caro: las suscripciones de push, el respaldo por correo y el registro
 * de entregas. Vive en un archivo aparte porque lo que decide es distinto —una
 * cita no es un recordatorio que se repite— y mezclarlos habría convertido
 * `runSweep` en dos funciones dentro de una.
 *
 * ## A quién se avisa
 *
 * **A la persona atendida, no al profesional.** Quien tiene diez consultas al
 * día no necesita diez notificaciones diciéndoselo; tiene su agenda. Quien
 * tiene una consulta al mes es quien se le pasa.
 *
 * ## Sin silencio horario
 *
 * El barrido de recordatorios respeta las horas de silencio porque un
 * recordatorio se programa a una hora concreta. Un aviso de cita no: dice «hoy
 * a las 5» y llega cuando llega. Aplicarle el silencio de la madrugada no
 * cambiaría nada —el barrido corre por la mañana— y silenciar una consulta que
 * la persona misma agendó sería pasarse de celoso.
 *
 * Lo que sí se respeta es tener el push apagado: si no eligió ningún canal, no
 * se le manda nada por ninguno.
 */
import { appointmentNotice } from './appointment-notice';
import { reminderEmail, sendEmail } from './email';
import { sendPush, vapidFromEnv } from './webpush';
import {
  dropDeadSubscription,
  logDelivery,
  markAppointmentNoticed,
  markSubscriptionDelivered,
  subscriptionsForUser,
  type AppointmentNoticeCandidate,
} from '../db/repositories/notifications';

export type AppointmentSweepSummary = {
  revisadas: number;
  avisadas: number;
  vispera: number;
  mismoDia: number;
  pushEnviados: number;
  correosEnviados: number;
  sinCanales: number;
  sinVapid: boolean;
};

function emptySummary(): AppointmentSweepSummary {
  return {
    revisadas: 0,
    avisadas: 0,
    vispera: 0,
    mismoDia: 0,
    pushEnviados: 0,
    correosEnviados: 0,
    sinCanales: 0,
    sinVapid: false,
  };
}

export async function runAppointmentSweep(
  candidates: AppointmentNoticeCandidate[],
  now: Date,
): Promise<AppointmentSweepSummary> {
  const summary = emptySummary();
  const vapid = vapidFromEnv();
  summary.sinVapid = vapid === null;

  for (const candidate of candidates) {
    summary.revisadas += 1;

    const verdict = appointmentNotice(
      {
        scheduledAt: candidate.scheduledAt,
        status: candidate.status,
        noticeSentAt: candidate.noticeSentAt,
        timeZone: candidate.preferences.timeZone,
        withWhom: candidate.professionalName,
      },
      now,
    );

    if (!verdict.due) continue;

    const canales = candidate.preferences.channels;
    if (canales.length === 0) {
      summary.sinCanales += 1;
      /*
       * Se marca como avisada igualmente. Si no, cada barrido volvería a
       * evaluarla y a no enviar nada, y el registro daría a entender que hay
       * un aviso pendiente que en realidad nadie quiere recibir.
       */
      await markAppointmentNoticed(candidate.appointmentId, now);
      continue;
    }

    let entregado = false;

    if (canales.includes('push') && vapid) {
      entregado = await enviarPush(candidate, verdict.title, verdict.body, vapid, summary);
    }

    // El correo es respaldo, igual que en los recordatorios: recibir el mismo
    // aviso por dos vías es ruido.
    if (!entregado && canales.includes('correo') && candidate.clientEmail) {
      const result = await sendEmail(
        reminderEmail({
          to: candidate.clientEmail,
          title: verdict.title,
          body: verdict.body,
        }),
      );

      await logDelivery({
        tenantId: candidate.tenantId,
        userId: candidate.clientUserId,
        reminderId: null,
        channel: 'correo',
        status: result.ok ? 'enviado' : result.configured ? 'fallido' : 'omitido',
        error: result.ok ? null : result.error,
      });

      if (result.ok) {
        summary.correosEnviados += 1;
        entregado = true;
      }
    }

    await markAppointmentNoticed(candidate.appointmentId, now);

    summary.avisadas += 1;
    if (verdict.kind === 'vispera') summary.vispera += 1;
    else summary.mismoDia += 1;
  }

  return summary;
}

async function enviarPush(
  candidate: AppointmentNoticeCandidate,
  title: string,
  body: string,
  vapid: NonNullable<ReturnType<typeof vapidFromEnv>>,
  summary: AppointmentSweepSummary,
): Promise<boolean> {
  const subscriptions = await subscriptionsForUser(
    candidate.tenantId,
    candidate.clientUserId,
  );

  if (subscriptions.length === 0) return false;

  // La notificación lleva a Consultorio, no a la raíz: quien la toca quiere
  // entrar a su cita, no leer el inicio.
  const payload = JSON.stringify({ title, body, url: '/consultorio' });
  let alguno = false;

  for (const subscription of subscriptions) {
    const result = await sendPush(
      { endpoint: subscription.endpoint, keys: subscription.keys },
      payload,
      vapid,
    );

    if (result.ok) {
      alguno = true;
      summary.pushEnviados += 1;
      await markSubscriptionDelivered(subscription.endpoint);
      continue;
    }

    if (result.gone) await dropDeadSubscription(subscription.endpoint);

    await logDelivery({
      tenantId: candidate.tenantId,
      userId: candidate.clientUserId,
      reminderId: null,
      channel: 'push',
      status: 'fallido',
      error: result.error,
    });
  }

  if (alguno) {
    await logDelivery({
      tenantId: candidate.tenantId,
      userId: candidate.clientUserId,
      reminderId: null,
      channel: 'push',
      status: 'enviado',
    });
  }

  return alguno;
}
