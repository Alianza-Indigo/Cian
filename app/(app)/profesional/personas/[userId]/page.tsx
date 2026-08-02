import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/context';
import { clientDossier } from '@/lib/db/repositories/practice';
import { DossierBoard } from './dossier-board';

export const metadata: Metadata = { title: 'Recorrido' };
export const dynamic = 'force-dynamic';

/**
 * El recorrido de una persona con este profesional.
 *
 * `clientDossier` devuelve `null` cuando no hay ninguna cita en común, y la
 * página responde `notFound()`. Es deliberado: una ficha vacía confirmaría que
 * esa persona existe en el espacio, y eso ya es información.
 */
export default async function PersonaPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const [ctx, { userId }] = await Promise.all([requireTenantContext(), params]);

  const dossier = await clientDossier(ctx, decodeURIComponent(userId));
  if (!dossier) notFound();

  return (
    <DossierBoard
      userId={dossier.userId}
      name={dossier.name ?? dossier.email ?? 'Sin nombre'}
      sessions={dossier.sessions.map((session) => ({
        appointmentId: session.appointmentId,
        sessionId: session.sessionId,
        scheduledAt: session.scheduledAt.toISOString(),
        status: session.status,
        reason: session.reason,
        notes: session.notes,
        tasks: session.tasks,
        summary: session.summary,
      }))}
    />
  );
}
