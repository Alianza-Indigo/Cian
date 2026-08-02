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

  const session = await ensureSession(ctx, id);

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
