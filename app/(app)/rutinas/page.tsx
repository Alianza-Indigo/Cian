import type { Metadata } from 'next';
import Link from 'next/link';
import { requireTenantContext } from '@/lib/tenant/context';
import { listRoutines } from '@/lib/db/repositories/routines';
import { Card } from '@/components/ui/card';
import { ROUTINE_TYPE_LABELS } from '@/lib/plans/types';

export const metadata: Metadata = { title: 'Rutinas' };
export const dynamic = 'force-dynamic';

export default async function RutinasPage() {
  const ctx = await requireTenantContext();
  const routines = await listRoutines(ctx);

  return (
    <div style={{ display: 'grid', gap: 'var(--cian-section-gap)' }}>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Rutinas</h1>
        <p className="mt-2 text-muted-foreground">
          Secuencias de pasos para las partes del día que conviene tener
          organizadas. Puedes recorrerlas paso a paso, un momento a la vez.
        </p>
      </div>

      {routines.length === 0 ? (
        <Card>
          <p className="text-sm text-muted-foreground">
            Todavía no tienes rutinas. En una conversación puedes pedir algo como
            «necesito una rutina matutina para mi hijo de 7 años».
          </p>
        </Card>
      ) : (
        <ul style={{ display: 'grid', gap: 'var(--cian-gap)' }}>
          {routines.map((routine) => (
            <li key={routine.id}>
              <Link
                href={`/rutinas/${routine.id}`}
                className="block rounded-xl border border-border bg-card transition-colors hover:bg-muted"
                style={{ padding: 'var(--cian-block-padding)' }}
              >
                <h2 className="text-sm font-semibold">{routine.title}</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {ROUTINE_TYPE_LABELS[routine.type]}
                  {routine.active ? '' : ' · En pausa'}
                </p>
                {routine.description ? (
                  <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                    {routine.description}
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
