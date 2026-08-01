/**
 * Descarga de un documento.
 *
 * Criterio de aceptación: «un documento de un tenant no es accesible por URL
 * desde otro tenant». Por eso el archivo se guarda con acceso privado y
 * **nunca se expone la URL del store**: se sirve desde aquí, después de
 * comprobar el contexto de tenant contra la base de datos.
 *
 * Si esto devolviera un redirect a la URL del blob, el enlace quedaría
 * suelto en el historial del navegador y el criterio se incumpliría.
 */
import { getTenantContext } from '@/lib/tenant/context';
import { getDocument } from '@/lib/db/repositories/documents';
import { DOCUMENT_MIME_TYPES, toFileName } from '@/lib/documents/types';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ id: string }> };

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
  const ctx = await getTenantContext();
  if (!ctx) {
    return jsonError('Necesitas iniciar sesión.', 401);
  }

  const { id } = await context.params;

  // `getDocument` acota por tenant y por persona: un documento ajeno
  // sencillamente no existe desde aquí.
  const document = await getDocument(ctx, id);
  if (!document) {
    return jsonError('No encontramos ese documento.', 404);
  }

  if (document.status !== 'ready' || !document.blobUrl) {
    return jsonError('El documento todavía se está preparando.', 409);
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    return jsonError('No hay almacenamiento de archivos configurado.', 503);
  }

  // El blob es privado: se lee con credenciales desde el servidor y se
  // reenvía. El cliente nunca ve la URL del store.
  const upstream = await fetch(document.blobUrl, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });

  if (!upstream.ok || !upstream.body) {
    return jsonError('No pudimos recuperar el archivo.', 502);
  }

  const filename = toFileName(document.title, document.format);

  return new Response(upstream.body, {
    headers: {
      'Content-Type': DOCUMENT_MIME_TYPES[document.format],
      // `attachment` para que el navegador descargue en vez de intentar
      // abrirlo dentro de la aplicación.
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
      ...(document.sizeBytes
        ? { 'Content-Length': String(document.sizeBytes) }
        : {}),
    },
  });
}
