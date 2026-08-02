/**
 * Descarga de un documento compartido.
 *
 * Existe aparte de `/api/documentos/[id]` porque el invitado no pertenece al
 * tenant del dueño: la ruta normal no lo encontraría nunca. Aquí el permiso
 * viene del `share`, y el identificador que se acepta desde fuera es el del
 * `share`, **no el del documento**. Así nadie puede pedir un archivo distinto
 * al que se le compartió.
 *
 * Criterio del PRD: «cada acceso a un recurso compartido queda registrado».
 * Por eso la descarga escribe en `audit_log` antes de servir el archivo.
 */
import { and, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { documents } from '@/lib/db/schema/documents';
import { getSharedResource } from '@/lib/db/repositories/team';
import { recordSharedAccess } from '@/lib/team/audit';
import { DOCUMENT_MIME_TYPES, toFileName } from '@/lib/documents/types';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ shareId: string }> };

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) return jsonError('Necesitas iniciar sesión.', 401);

  const { shareId } = await context.params;

  // Comprueba en este instante que sigue compartido y sigue siendo para esta
  // persona. Revocar corta aquí, aunque la pestaña lleve horas abierta.
  const shared = await getSharedResource(session.user.id, shareId);
  if (!shared) return jsonError('No encontramos ese recurso.', 404);

  const { share } = shared;
  if (share.resourceType !== 'documento' && share.resourceType !== 'material_educativo') {
    return jsonError('Ese recurso no es un archivo.', 400);
  }

  const documentId =
    share.resourceType === 'documento' ? share.resourceId : await linkedDocumentId(share.tenantId, share.resourceId);

  if (!documentId) return jsonError('Ese material no tiene archivo.', 404);

  const [document] = await db
    .select()
    .from(documents)
    .where(
      and(eq(documents.id, documentId), eq(documents.tenantId, share.tenantId)),
    )
    .limit(1);

  if (!document) return jsonError('No encontramos ese documento.', 404);

  if (document.status !== 'ready' || !document.blobUrl) {
    return jsonError('El documento todavía se está preparando.', 409);
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return jsonError('No hay almacenamiento configurado.', 503);

  await recordSharedAccess({
    tenantId: share.tenantId,
    viewerUserId: session.user.id,
    shareId: share.id,
    resourceType: share.resourceType,
    action: 'share.download',
  });

  const upstream = await fetch(document.blobUrl, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });

  if (!upstream.ok || !upstream.body) {
    return jsonError('No pudimos recuperar el archivo.', 502);
  }

  return new Response(upstream.body, {
    headers: {
      'Content-Type': DOCUMENT_MIME_TYPES[document.format],
      'Content-Disposition': `attachment; filename="${toFileName(
        document.title,
        document.format,
      )}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}

/** El PDF exportado de un material educativo, si existe. */
async function linkedDocumentId(
  tenantId: string,
  itemId: string,
): Promise<string | null> {
  const { educationItems } = await import('@/lib/db/schema/library');

  const [item] = await db
    .select({ documentId: educationItems.documentId })
    .from(educationItems)
    .where(
      and(eq(educationItems.id, itemId), eq(educationItems.tenantId, tenantId)),
    )
    .limit(1);

  return item?.documentId ?? null;
}
