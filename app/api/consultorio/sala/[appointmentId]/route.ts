/**
 * El enlace de la videollamada. Fase 10.
 *
 * La videollamada la pone Google Meet. Lo que CIAN controla —y lo que hace esta
 * ruta— es **quién ve el enlace y cuándo**.
 *
 * ## Por qué el enlace no va en la página
 *
 * Podría pintarse directamente en la pantalla de la sesión y ahorrarse esta
 * ruta. No se hace: el HTML de una página se guarda en el historial, se copia
 * al compartir pantalla y sobrevive a que la cita se cancele. Pedirlo a una
 * ruta significa que cada vez que alguien lo obtiene se comprueba, en ese
 * instante, que sigue teniendo derecho a obtenerlo.
 *
 * ## Lo que se comprueba antes de devolverlo
 *
 * 1. Que quien pide sea **parte de esa cita** —profesional o persona atendida—
 *    y del mismo tenant. Lo resuelve `getAppointmentForParticipant` en una sola
 *    consulta; sin eso, un identificador de cita ajeno bastaría para colarse.
 * 2. Que la cita esté **confirmada**. Una solicitada o cancelada no abre nada.
 * 3. Que estemos **dentro de la ventana**: la sala de espera abre unos minutos
 *    antes y sigue abierta un rato después, porque una consulta que empieza
 *    tarde no debe encontrar la puerta cerrada.
 *
 * Lo que ocurra dentro de Meet ya no es nuestro. Ver `RECORDING_NOTICE`.
 */
import { getTenantContext } from '@/lib/tenant/context';
import {
  ensureSession,
  getAppointmentForParticipant,
  meetingUrlForAppointment,
} from '@/lib/db/repositories/consultorio';
import { canStartRecording } from '@/lib/consultorio/consent';
import { joinWindow } from '@/lib/consultorio/availability';
import {
  JOIN_GRACE_MINUTES_AFTER,
  WAITING_ROOM_MINUTES_BEFORE,
  canJoinRoom,
} from '@/lib/consultorio/types';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ appointmentId: string }> };

function json(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  const ctx = await getTenantContext();
  if (!ctx) return json({ error: 'Necesitas iniciar sesión.' }, 401);

  const { appointmentId } = await context.params;

  const found = await getAppointmentForParticipant(ctx, appointmentId);
  if (!found) return json({ error: 'No encontramos esa cita.' }, 404);

  const { appointment, role } = found;

  if (!canJoinRoom(appointment.status)) {
    return json(
      { error: 'La cita todavía no está confirmada, o ya no está vigente.' },
      409,
    );
  }

  const window = joinWindow(
    appointment.scheduledAt,
    new Date(),
    WAITING_ROOM_MINUTES_BEFORE,
    appointment.durationMinutes + JOIN_GRACE_MINUTES_AFTER,
  );

  if (!window.open) {
    return json(
      {
        error: 'La sala no está abierta en este momento.',
        abreA: window.opensAt.toISOString(),
        cierraA: window.closesAt.toISOString(),
      },
      409,
    );
  }

  const url = await meetingUrlForAppointment(ctx.tenantId, appointmentId);

  if (!url) {
    return json(
      {
        error:
          role === 'profesional'
            ? 'Todavía no pusiste tu enlace de Google Meet. Lo configuras en tu perfil profesional.'
            : 'El profesional todavía no ha puesto el enlace de la videollamada.',
        configurado: false,
      },
      409,
    );
  }

  /*
   * `ensureSession` vuelve a comprobar estado y ventana por su cuenta —ahora
   * exige lo mismo que esta ruta— así que aquí no puede fallar: si llegamos a
   * esta línea, ya pasamos ambas. Se contempla igual porque el tiempo corre
   * entre una comprobación y otra, y un `null` silencioso sería peor que un 409.
   */
  const consultSession = await ensureSession(ctx, appointmentId);

  if (!consultSession) {
    return json({ error: 'La sala no está abierta en este momento.' }, 409);
  }

  const consent = canStartRecording(consultSession.recordingConsent);

  return json(
    {
      url,
      sessionId: consultSession.id,
      role,
      // Se informa del estado del acuerdo, no de un permiso técnico: dentro de
      // Meet, quien decide grabar es Google y quien maneja la reunión.
      consentimientoDeGrabacion: consent.allowed,
    },
    200,
  );
}
