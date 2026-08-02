import type { Metadata } from 'next';
import Link from 'next/link';
import { requireTenantContext } from '@/lib/tenant/context';
import { listPlans } from '@/lib/db/repositories/plans';
import { Card } from '@/components/ui/card';
import { PLAN_STATUS_LABELS, PLAN_TYPE_LABELS } from '@/lib/plans/types';

export const metadata: Metadata = { title: 'Planes' };
export const dynamic = 'force-dynamic';

export default async function PlanesPage() {
  const ctx = await requireTenantContext();
  const plans = await listPlans(ctx);

  return (
    <div style={{ display: 'grid', gap: 'var(--cian-section-gap)' }}>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Planes de apoyo</h1>
        <p className="mt-2 text-muted-foreground">
          Objetivos concretos con estrategias para lograrlos. Puedes editarlos,
          registrar cómo van y exportarlos a PDF.
        </p>
      </div>

      {plans.length === 0 ? (
        <Card>
          <p className="text-sm text-muted-foreground">
            Todavía no tienes planes. En una conversación puedes contarle a CIAN
            la situación y pedirle «conviértelo en un plan».
          </p>
        </Card>
      ) : (
        <ul style={{ display: 'grid', gap: 'var(--cian-gap)' }}>
          {plans.map((plan) => (
            <li key={plan.id}>
              <Link
                href={`/planes/${plan.id}`}
                className="block rounded-xl border border-border bg-card transition-colors hover:bg-muted"
                style={{ padding: 'var(--cian-block-padding)' }}
              >
                <h2 className="text-sm font-semibold">{plan.title}</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {PLAN_TYPE_LABELS[plan.type]} · {PLAN_STATUS_LABELS[plan.status]}
                </p>
                {plan.description ? (
                  <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                    {plan.description}
                  </p>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
