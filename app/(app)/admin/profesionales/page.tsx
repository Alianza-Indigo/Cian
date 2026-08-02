import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getAdminContext } from '@/lib/admin/access';
import { listProfessionals } from '@/lib/db/repositories/consultorio';
import { VerificationBoard } from './verification-board';

export const metadata: Metadata = { title: 'Profesionales' };
export const dynamic = 'force-dynamic';

/**
 * Alta y verificación de profesionales del espacio.
 *
 * Estaba dentro de «Perfil profesional», debajo del formulario del perfil
 * propio, y ese era el problema: quien administra entraba a una pantalla que
 * se llama como si fuera suya para dar de alta a otros. Son dos tareas de
 * naturaleza distinta y ahora viven separadas.
 */
export default async function AdminProfesionalesPage() {
  const admin = await getAdminContext();
  if (!admin) notFound();

  // `false` = también los que están pendientes; son justo los que hay que ver.
  const roster = await listProfessionals(admin.ctx, false);

  return (
    <VerificationBoard
      roster={roster.map((entry) => ({
        id: entry.id,
        name: entry.name ?? entry.email ?? 'Sin nombre',
        specialties: entry.specialties,
        licenseNumber: entry.licenseNumber,
        licenseDocs: entry.licenseDocs.map((doc) => ({
          filename: doc.filename,
          blobUrl: doc.blobUrl,
        })),
        verificationStatus: entry.verificationStatus,
        termsAcceptedAt: entry.termsAcceptedAt?.toISOString() ?? null,
        isMe: entry.userId === admin.ctx.userId,
      }))}
    />
  );
}
