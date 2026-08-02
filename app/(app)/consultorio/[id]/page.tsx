import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/context';
import {
  ensureSession,
  getAppointmentForParticipant,
  getSessionSummary,
  readWhiteboard,
  listSessionNotes,
  listSessionShares,
  listSessionTasks,
  meetingUrlForAppointment,
} from '@/lib/db/repositories/consultorio';
import { listPlans } from '@/lib/db/repositories/plans';
import { listRoutines } from '@/lib/db/repositories/routines';
import { listDocuments } from '@/lib/db/repositories/documents';
import { canStartRecording, hasSigned } from '@/lib/consultorio/consent';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { joinWindow } from '@/lib/consultorio/availability';
import {
  APPOINTMENT_STATUS_LABELS,
  JOIN_GRACE_MINUTES_AFTER,
  WAITING_ROOM_MINUTES_BEFORE,
  canJoinRoom,
  type AppointmentStatus,
} from '@/lib/consultorio/types';
import { SessionRoom } from './session-room';

export const metadata: Metadata = { title: 'Sesión' };
export const dynamic = 'force-dynamic';

export default async function SesionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [ctx, { id }] = await Promise.all([requireTenantContext(), params]);

  /*
   * Una cita de la que esta persona no es parte sencillamente no existe desde
   * aquí. Es lo que sostiene «un profesional del tenant A no puede ver
   * pacientes del tenant B»: la consulta filtra por tenant y por participación
   * en el mismo `where`.
   */
  const found = await getAppointmentForParticipant(ctx, id);
  if (!found) notFound();

  /*
   * Abrir la sesión clínica es lo que sella su hora de inicio, así que no puede
   * pasar solo por visitar la URL.
   *
   * Antes se creaba aquí sin mirar nada más que la participación: una cita del
   * jueves que alguien abría el lunes nacía con `started_at` del lunes, y sobre
   * una cita solicitada —o cancelada— se podían escribir notas, tareas y pizarra.
   * No es una fuga, las dos partes son legítimas; es un expediente que dice que
   * pasó algo que no pasó.
   *
   * `ensureSession` exige ahora lo mismo que la ruta de la videollamada: cita
   * vigente y dentro de la ventana de la sala. Si todavía no toca, se enseña la
   * espera y no se crea nada.
   */
  const session = await ensureSession(ctx, id).catch(() => null);

  if (!session) {
    return (
      <SalaCerrada
        scheduledAt={found.appointment.scheduledAt}
        durationMinutes={found.appointment.durationMinutes}
        status={found.appointment.status}
      />
    );
  }

  const [notes, tasks, summary, whiteboard, meetingUrl, shares, plans, routines, documents] =
    await Promise.all([
      listSessionNotes(ctx, session.id),
      listSessionTasks(ctx, session.id),
      getSessionSummary(ctx, session.id),
      readWhiteboard(ctx, session.id),
      // Solo para saber si hay enlace. El enlace en sí no viaja en el HTML: se
      // pide a la ruta, que comprueba la ventana horaria en ese instante.
      meetingUrlForAppointment(ctx.tenantId, id),
      listSessionShares(ctx, session.id),
      /*
       * Lo que esta persona puede ofrecer. Los tres listados filtran por
       * `userId`, así que aquí solo sale lo suyo: la lista del selector no
       * puede enseñar lo de la otra parte ni por error de pintado.
       */
      listPlans(ctx, 50),
      listRoutines(ctx, 50),
      listDocuments(ctx, 50),
    ]);

  return (
    <SessionRoom
      appointmentId={found.appointment.id}
      sessionId={session.id}
      role={found.role}
      scheduledAt={found.appointment.scheduledAt.toISOString()}
      durationMinutes={found.appointment.durationMinutes}
      status={found.appointment.status}
      otherPartyUserId={
        found.role === 'profesional' ? found.appointment.clientUserId : null
      }
      hasMeetingLink={Boolean(meetingUrl)}
      consent={{
        mine: hasSigned(session.recordingConsent, found.role),
        both: canStartRecording(session.recordingConsent).allowed,
      }}
      notes={notes.map((note) => ({
        id: note.id,
        visibility: note.visibility,
        content: note.content,
        createdAt: note.createdAt.toISOString(),
        isMine: note.authorUserId === ctx.userId,
      }))}
      tasks={tasks.map((task) => ({
        id: task.id,
        title: task.title,
        description: task.description,
        status: task.status,
        isMine: task.assignedToUserId === ctx.userId,
      }))}
      summary={
        summary
          ? { content: summary.content, published: summary.published }
          : null
      }
      whiteboard={whiteboard.state}
      whiteboardRevision={whiteboard.revision}
      shares={shares.map((share) => ({
        id: share.id,
        resourceType: share.resourceType,
        resourceTitle: share.resourceTitle,
        isMine: share.sharedByUserId === ctx.userId,
      }))}
      shareable={[
        ...plans.map((plan) => ({
          type: 'plan' as const,
          id: plan.id,
          title: plan.title,
        })),
        ...routines.map((routine) => ({
          type: 'rutina' as const,
          id: routine.id,
          title: routine.title,
        })),
        ...documents.map((doc) => ({
          type: 'documento' as const,
          id: doc.id,
          title: doc.title,
        })),
      ]}
      endedAt={session.endedAt?.toISOString() ?? null}
    />
  );
}

/**
 * La sala todavía no está abierta —o la cita ya no está vigente—.
 *
 * Se enseña cuándo abre en vez de un error: quien llega media hora antes no ha
 * hecho nada mal. Y no se crea ninguna sesión clínica por mirar esta pantalla,
 * que es justo lo que se venía haciendo.
 */
function SalaCerrada({
  scheduledAt,
  durationMinutes,
  status,
}: {
  scheduledAt: Date;
  durationMinutes: number;
  status: AppointmentStatus;
}) {
  const window = joinWindow(
    scheduledAt,
    new Date(),
    WAITING_ROOM_MINUTES_BEFORE,
    durationMinutes + JOIN_GRACE_MINUTES_AFTER,
  );

  const cuando = new Intl.DateTimeFormat('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
  });

  const vigente = canJoinRoom(status);

  return (
    <div style={{ display: 'grid', gap: 'var(--cian-section-gap)' }}>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {vigente ? 'La sala todavía no está abierta' : 'Esta cita no está vigente'}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {vigente
            ? `La cita es el ${cuando.format(scheduledAt)}. Puedes entrar desde las ${new Intl.DateTimeFormat(
                'es-MX',
                { hour: 'numeric', minute: '2-digit' },
              ).format(window.opensAt)}.`
            : `Está ${APPOINTMENT_STATUS_LABELS[status].toLowerCase()}. Mientras no esté confirmada no hay sesión que abrir.`}
        </p>
      </div>

      <Card>
        <p className="text-sm text-muted-foreground">
          Las notas, la pizarra y las tareas de una consulta se crean cuando la
          consulta empieza. Hasta entonces no hay nada que ver aquí, y tampoco se
          guarda una hora de inicio que no correspondería a nada.
        </p>
        <p className="mt-3 text-sm">
          <Link href="/consultorio" className="underline underline-offset-4">
            Volver al consultorio
          </Link>
        </p>
      </Card>
    </div>
  );
}
