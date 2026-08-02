import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { assertSuperadmin } from '@/lib/admin/access';
import { getPlanLimits } from '@/lib/db/repositories/billing';
import { PLANS } from '@/lib/billing/types';
import { PlanLimitsBoard } from './plan-limits-board';

export const metadata: Metadata = { title: 'Planes' };
export const dynamic = 'force-dynamic';

export default async function AdminPlanesPage() {
  try {
    await assertSuperadmin('adminPlanes');
  } catch {
    notFound();
  }

  const limits = await Promise.all(
    PLANS.map(async (plan) => ({ plan, limits: await getPlanLimits(plan) })),
  );

  return <PlanLimitsBoard plans={limits} />;
}
