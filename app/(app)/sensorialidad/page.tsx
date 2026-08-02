import type { Metadata } from 'next';
import { requireTenantContext } from '@/lib/tenant/context';
import {
  listSensoryEvents,
  listSensoryProfiles,
  listSensoryTools,
} from '@/lib/db/repositories/sensory';
import { SensoryBoard } from './sensory-board';

export const metadata: Metadata = { title: 'Sensorialidad' };
export const dynamic = 'force-dynamic';

export default async function SensorialidadPage() {
  const ctx = await requireTenantContext();

  const [profiles, tools, events] = await Promise.all([
    listSensoryProfiles(ctx),
    listSensoryTools(ctx),
    listSensoryEvents(ctx, 15),
  ]);

  return (
    <div style={{ display: 'grid', gap: 'var(--cian-section-gap)' }}>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sensorialidad</h1>
        <p className="mt-2 text-muted-foreground">
          Cómo se vive cada sentido, qué lo altera y qué ayuda a regularlo. CIAN
          usa esto para no proponerte lo que ya sabes que no funciona.
        </p>
      </div>

      <SensoryBoard
        profiles={profiles.map((profile) => ({
          domain: profile.domain,
          sensitivity: profile.sensitivity,
          triggers: profile.triggers,
          strategies: profile.strategies,
        }))}
        tools={tools.map((tool) => ({
          id: tool.id,
          name: tool.name,
          domain: tool.domain,
          effective: tool.effective,
        }))}
        events={events.map((event) => ({
          id: event.id,
          domain: event.domain,
          intensity: event.intensity,
          context: event.context,
          outcome: event.outcome,
          occurredAt: event.occurredAt.toISOString(),
        }))}
      />
    </div>
  );
}
