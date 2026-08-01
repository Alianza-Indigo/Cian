import type { Metadata } from 'next';
import { requireTenantContext } from '@/lib/tenant/context';
import { getEffectivePreferences } from '@/lib/db/repositories/preferences';
import { AccessibilityForm } from './accessibility-form';

export const metadata: Metadata = {
  title: 'Accesibilidad',
};

export const dynamic = 'force-dynamic';

export default async function AccesibilidadPage() {
  const ctx = await requireTenantContext();
  const preferences = await getEffectivePreferences(ctx);

  return (
    <div style={{ display: 'grid', gap: 'var(--cian-section-gap)' }}>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Accesibilidad</h1>
        <p className="mt-2 text-muted-foreground">
          Cambia cómo se ve y cómo se comporta CIAN. Los cambios se aplican al
          momento y quedan guardados en tu cuenta.
        </p>
      </div>

      <AccessibilityForm initialPreferences={preferences} />
    </div>
  );
}
