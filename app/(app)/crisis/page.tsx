import type { Metadata } from 'next';
import { requireTenantContext } from '@/lib/tenant/context';
import {
  listCrisisEvents,
  listCrisisProtocols,
} from '@/lib/db/repositories/crisis';
import { PATTERN_WINDOW } from '@/lib/crisis/types';
import { CrisisLog } from './crisis-log';

export const metadata: Metadata = { title: 'Crisis' };
export const dynamic = 'force-dynamic';

export default async function CrisisPage() {
  const ctx = await requireTenantContext();

  const [events, protocols] = await Promise.all([
    listCrisisEvents(ctx, PATTERN_WINDOW),
    listCrisisProtocols(ctx),
  ]);

  return (
    <div style={{ display: 'grid', gap: 'var(--cian-section-gap)' }}>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Crisis</h1>
        <p className="mt-2 text-muted-foreground">
          La bitácora de lo que ha pasado y de lo que ha servido. Con el tiempo
          aparecen patrones que en el momento no se ven, y esto es lo que CIAN
          consulta antes de proponerte nada.
        </p>
      </div>

      <CrisisLog
        events={events.map((event) => ({
          id: event.id,
          severity: event.severity,
          summary: event.summary,
          triggers: event.triggers,
          actionsTaken: event.actionsTaken,
          outcome: event.outcome,
          escalated: event.escalated,
          postPlanId: event.postPlanId,
          startedAt: event.startedAt.toISOString(),
        }))}
        protocols={protocols.map((protocol) => ({
          id: protocol.id,
          title: protocol.title,
          steps: protocol.steps,
          active: protocol.active,
        }))}
      />
    </div>
  );
}
