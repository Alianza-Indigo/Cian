import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/context';
import { getPlan, listPlanProgress } from '@/lib/db/repositories/plans';
import { PlanDetail } from './plan-detail';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const ctx = await requireTenantContext();
  const plan = await getPlan(ctx, id);
  return { title: plan?.title ?? 'Plan' };
}

export default async function PlanPage({ params }: PageProps) {
  const { id } = await params;
  const ctx = await requireTenantContext();

  const plan = await getPlan(ctx, id);
  if (!plan) notFound();

  const progress = await listPlanProgress(ctx, plan.id, 30);

  return (
    <PlanDetail
      plan={{
        id: plan.id,
        title: plan.title,
        description: plan.description,
        type: plan.type,
        status: plan.status,
        objectives: plan.objectives.map((objective) => ({
          id: objective.id,
          title: objective.title,
          status: objective.status,
          strategies: objective.strategies.map((strategy) => ({
            id: strategy.id,
            content: strategy.content,
          })),
        })),
      }}
      progress={progress.map((entry) => ({
        id: entry.id,
        objectiveId: entry.objectiveId,
        note: entry.note,
        rating: entry.rating,
        loggedAt: entry.loggedAt.toISOString(),
      }))}
    />
  );
}
