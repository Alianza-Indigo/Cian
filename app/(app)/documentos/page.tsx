import type { Metadata } from 'next';
import { requireTenantContext } from '@/lib/tenant/context';
import { listDocuments } from '@/lib/db/repositories/documents';
import { DOCUMENT_TYPE_LABELS } from '@/lib/documents/types';
import { DocumentLibrary } from './document-library';

export const metadata: Metadata = { title: 'Documentos' };
export const dynamic = 'force-dynamic';

export default async function DocumentosPage() {
  const ctx = await requireTenantContext();
  const documents = await listDocuments(ctx);

  return (
    <div style={{ display: 'grid', gap: 'var(--cian-section-gap)' }}>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Documentos</h1>
        <p className="mt-2 text-muted-foreground">
          Todo lo que CIAN ha preparado contigo. Puedes descargarlo, cambiarle
          el nombre, pedir una versión corregida o eliminarlo.
        </p>
      </div>

      <DocumentLibrary
        documents={documents.map((document) => ({
          id: document.id,
          title: document.title,
          typeLabel: DOCUMENT_TYPE_LABELS[document.type],
          format: document.format,
          status: document.status,
          folio: document.folio,
          sizeBytes: document.sizeBytes,
          createdAt: document.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
