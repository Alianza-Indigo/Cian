import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { assertSuperadmin } from '@/lib/admin/access';
import { spaceDetail } from '@/lib/admin/platform';
import { SpaceBoard } from './space-board';

export const metadata: Metadata = { title: 'Espacio' };
export const dynamic = 'force-dynamic';

/**
 * Un espacio visto desde la plataforma.
 *
 * Miembros con su rol, profesionales con su cédula y sus documentos, y la
 * actividad del consultorio: cuándo, entre quiénes y en qué estado.
 *
 * De cada cita se ve **que ocurrió**, nunca lo que se dijo. Esa línea la
 * sostiene `lib/admin/platform.ts`, que sencillamente no tiene ninguna consulta
 * a las tablas de notas, resúmenes, bitácoras ni conversaciones — y una prueba
 * que falla si alguna vez la tiene.
 */
export default async function EspacioPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  try {
    await assertSuperadmin('adminEspacio');
  } catch {
    notFound();
  }

  const { tenantId } = await params;
  const detail = await spaceDetail(tenantId);
  if (!detail) notFound();

  return (
    <SpaceBoard
      tenantId={detail.space.id}
      name={detail.space.name}
      plan={detail.space.plan}
      paidPlan={detail.paidPlan}
      grant={{
        plan: detail.grant.plan,
        limits: detail.grant.limits,
        mode: detail.grant.mode,
        note: detail.grant.note,
        grantedAt: detail.grant.grantedAt?.toISOString() ?? null,
      }}
      invitations={detail.invitations.map((invitation) => ({
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        expiresAt: invitation.expiresAt.toISOString(),
      }))}
      members={detail.members}
      professionals={detail.professionals.map((professional) => ({
        id: professional.id,
        name: professional.name ?? professional.email ?? 'Sin nombre',
        specialties: professional.specialties,
        licenseNumber: professional.licenseNumber,
        licenseDocs: professional.licenseDocs.map((doc) => ({
          filename: doc.filename,
          blobUrl: doc.blobUrl,
        })),
        verificationStatus: professional.verificationStatus,
        termsAcceptedAt: professional.termsAcceptedAt?.toISOString() ?? null,
      }))}
      appointments={detail.appointments.map((appointment) => ({
        id: appointment.id,
        scheduledAt: appointment.scheduledAt.toISOString(),
        durationMinutes: appointment.durationMinutes,
        status: appointment.status,
        professionalName: appointment.professionalName,
        clientName: appointment.clientName,
      }))}
    />
  );
}
