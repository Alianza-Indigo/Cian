import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/context';
import { getRoutine, listRoutineLogs } from '@/lib/db/repositories/routines';
import { RoutineDetail } from './routine-detail';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const ctx = await requireTenantContext();
  const routine = await getRoutine(ctx, id);
  return { title: routine?.title ?? 'Rutina' };
}

export default async function RutinaPage({ params }: PageProps) {
  const { id } = await params;
  const ctx = await requireTenantContext();

  const routine = await getRoutine(ctx, id);
  if (!routine) notFound();

  /*
   * Más de los que caben en pantalla: la tira de constancia son cuatro semanas
   * y la racha más larga puede venir de mucho antes. Con veinte registros
   * «tu mejor racha» sería «los últimos veinte días» y no es lo mismo.
   */
  const logs = await listRoutineLogs(ctx, routine.id, 200);

  return (
    <RoutineDetail
      routine={{
        id: routine.id,
        title: routine.title,
        description: routine.description,
        type: routine.type,
        active: routine.active,
        steps: routine.steps.map((step) => ({
          id: step.id,
          title: step.title,
          durationSeconds: step.durationSeconds,
          icon: step.icon,
          imageUrl: step.imageUrl,
          note: step.note,
        })),
      }}
      logs={logs.map((log) => ({
        id: log.id,
        completedAt: log.completedAt.toISOString(),
      }))}
    />
  );
}
