import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/context';
import {
  ensureSession,
  getAppointmentForParticipant,
  getSessionSummary,
  getWhiteboard,
  listSessionNotes,
  listSessionTasks,
} from '@/lib/db/repositories/consultorio';
import { canStartRecording, hasSigned } from '@/lib/consultorio/consent';
import { livekitConfigured } from '@/lib/consultorio/livekit';
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

  const [notes, tasks, summary, whiteboard] = await Promise.all([
    listSessionNotes(ctx, session.id),
    listSessionTasks(ctx, session.id),
    getSessionSummary(ctx, session.id),
    getWhiteboard(ctx, session.id),
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
      videoConfigured={livekitConfigured()}
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
      whiteboard={whiteboard}
      endedAt={session.endedAt?.toISOString() ?? null}
    />
  );
}
