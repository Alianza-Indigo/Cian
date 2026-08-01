/**
 * Estado de un documento en preparación.
 *
 * Lo consulta la tarjeta que aparece en el chat mientras se genera. Devuelve
 * lo mínimo para pintar: estado, título y tamaño. Nunca la URL del store.
 */
import { getTenantContext } from '@/lib/tenant/context';
import { getDocument } from '@/lib/db/repositories/documents';
import { DOCUMENT_TYPE_LABELS } from '@/lib/documents/types';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  const ctx = await getTenantContext();
  if (!ctx) {
    return Response.json({ error: 'Necesitas iniciar sesión.' }, { status: 401 });
  }

  const { id } = await context.params;
  const document = await getDocument(ctx, id);

  if (!document) {
    return Response.json(
      { error: 'No encontramos ese documento.' },
      { status: 404 },
    );
  }

  return Response.json(
    {
      id: document.id,
      estado: document.status,
      titulo: document.title,
      tipo: DOCUMENT_TYPE_LABELS[document.type],
      formato: document.format,
      folio: document.folio,
      tamanoBytes: document.sizeBytes,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
