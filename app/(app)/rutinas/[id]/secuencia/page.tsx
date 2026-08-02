import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/context';
import { getRoutine } from '@/lib/db/repositories/routines';
import { SequenceRunner } from './sequence-runner';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const ctx = await requireTenantContext();
  const routine = await getRoutine(ctx, id);
  return { title: routine ? `${routine.title} · paso a paso` : 'Rutina' };
}

export default async function SecuenciaPage({ params }: PageProps) {
  const { id } = await params;
  const ctx = await requireTenantContext();

  const routine = await getRoutine(ctx, id);
  if (!routine || routine.steps.length === 0) notFound();

  return (
    <SequenceRunner
      routineId={routine.id}
      title={routine.title}
      steps={routine.steps.map((step) => ({
        id: step.id,
        title: step.title,
        durationSeconds: step.durationSeconds,
        icon: step.icon,
        note: step.note,
      }))}
    />
  );
}
