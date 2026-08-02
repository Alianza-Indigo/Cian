/**
 * Token de entrada a la sala. Fase 10.
 *
 * El PRD lo pide así: «el token se emite desde una API route, el WebRTC vive en
 * el navegador». Esta es la ruta.
 *
 * ## Lo que se comprueba antes de firmar nada
 *
 * 1. Que quien pide sea **parte de esa cita** —profesional o persona atendida—
 *    y del mismo tenant. Lo resuelve `getAppointmentForParticipant` en una sola
 *    consulta; sin eso, un identificador de cita ajeno bastaría para entrar a
 *    la consulta de otra persona.
 * 2. Que la cita esté **confirmada**. Una cita solicitada o cancelada no abre
 *    sala.
 * 3. Que estemos **dentro de la ventana**: la sala de espera abre unos minutos
 *    antes y sigue abierta un rato después, porque una consulta que empieza
 *    tarde no debe encontrar la puerta cerrada.
 * 4. Que el consentimiento de grabación de **ambas partes** esté registrado
 *    antes de conceder `roomRecord`. Es la capa que hace imposible grabar sin
 *    permiso aunque alguien manipule el cliente.
 *
 * El nombre de la sala lo pone el servidor a partir del tenant y la cita. Si lo
 * eligiera el cliente, adivinar un nombre sería entrar a una consulta ajena.
 */
import { auth } from '@/lib/auth';
import { getTenantContext } from '@/lib/tenant/context';
import {
  ensureSession,
  getAppointmentForParticipant,
} from '@/lib/db/repositories/consultorio';
import { canStartRecording } from '@/lib/consultorio/consent';
import { createAccessToken, livekitConfigured } from '@/lib/consultorio/livekit';
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
  const [ctx, session] = await Promise.all([getTenantContext(), auth()]);

  if (!ctx || !session?.user?.id) {
    return json({ error: 'Necesitas iniciar sesión.' }, 401);
  }

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

  if (!livekitConfigured()) {
    return json(
      {
        error:
          'La videollamada todavía no está configurada en esta instalación. ' +
          'El resto de la sesión —notas, tareas, pizarra— sí funciona.',
        configurado: false,
      },
      503,
    );
  }

  const consultSession = await ensureSession(ctx, appointmentId);
  const consent = canStartRecording(consultSession.recordingConsent);

  const token = createAccessToken(
    {
      room: appointment.roomId,
      identity: ctx.userId,
      name: session.user.name ?? 'Participante',
      role,
      // Solo si ambas partes firmaron. Sin este permiso, el servidor de medios
      // rechaza la grabación aunque el cliente la pida.
      canRecord: consent.allowed,
    },
    Math.floor(Date.now() / 1000),
  );

  if (!token) {
    return json({ error: 'No pudimos emitir el acceso a la sala.' }, 503);
  }

  return json(
    {
      token: token.token,
      url: token.url,
      room: appointment.roomId,
      sessionId: consultSession.id,
      role,
      puedeGrabar: consent.allowed,
      expiraA: token.expiresAt,
    },
    200,
  );
}
