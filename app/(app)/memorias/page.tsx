import type { Metadata } from 'next';
import { requireTenantContext } from '@/lib/tenant/context';
import { listMemories } from '@/lib/db/repositories/memories';
import { MemoryList } from './memory-list';

export const metadata: Metadata = { title: 'Lo que recuerdo' };
export const dynamic = 'force-dynamic';

export default async function MemoriasPage() {
  const ctx = await requireTenantContext();
  const memories = await listMemories(ctx);

  return (
    <div style={{ display: 'grid', gap: 'var(--cian-section-gap)' }}>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Lo que recuerdo</h1>
        <p className="mt-2 text-muted-foreground">
          Esto es todo lo que CIAN guarda de ti entre conversaciones. Es tuyo:
          puedes corregirlo o borrarlo cuando quieras, y CIAN dejará de usarlo
          de inmediato.
        </p>
      </div>

      <MemoryList
        memories={memories.map((memory) => ({
          id: memory.id,
          key: memory.key,
          value: memory.value,
          confirmedByUser: memory.confirmedByUser,
          updatedAt: memory.updatedAt.toISOString(),
        }))}
      />
    </div>
  );
}
