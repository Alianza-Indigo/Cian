import type { Metadata } from 'next';
import { requireTenantContext } from '@/lib/tenant/context';
import { listEducationItems } from '@/lib/db/repositories/education';
import { EducationList } from './education-list';

export const metadata: Metadata = { title: 'Educación' };
export const dynamic = 'force-dynamic';

export default async function EducacionPage() {
  const ctx = await requireTenantContext();
  const items = await listEducationItems(ctx);

  return (
    <div style={{ display: 'grid', gap: 'var(--cian-section-gap)' }}>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Educación</h1>
        <p className="mt-2 text-muted-foreground">
          Adaptaciones, agendas visuales, guiones para reuniones escolares y
          material para docentes. Todo se puede exportar a PDF para llevarlo
          impreso.
        </p>
      </div>

      <EducationList
        items={items.map((item) => ({
          id: item.id,
          kind: item.kind,
          title: item.title,
          payload: item.payload,
          documentId: item.documentId,
          createdAt: item.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
