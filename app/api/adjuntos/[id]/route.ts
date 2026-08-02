/**
 * Entrega y borrado de un adjunto.
 *
 * Igual que con los documentos: el blob es privado y se reenvía desde aquí
 * después de comprobar el tenant. La URL del store no sale nunca al cliente.
 */
import { del } from '@vercel/blob';
import { getTenantContext } from '@/lib/tenant/context';
import {
  deleteAttachment,
  getAttachment,
} from '@/lib/db/repositories/attachments';

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
  if (!ctx) return jsonError('Necesitas iniciar sesión.', 401);

  const { id } = await context.params;
  const attachment = await getAttachment(ctx, id);
  if (!attachment) return jsonError('No encontramos ese archivo.', 404);

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return jsonError('No hay almacenamiento configurado.', 503);

  const upstream = await fetch(attachment.blobUrl, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });

  if (!upstream.ok || !upstream.body) {
    return jsonError('No pudimos recuperar el archivo.', 502);
  }

  return new Response(upstream.body, {
    headers: {
      'Content-Type': attachment.mime,
      // `inline` para que una imagen se pueda previsualizar en la conversación.
      'Content-Disposition': `inline; filename="${encodeURIComponent(attachment.filename)}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}

export async function DELETE(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  const ctx = await getTenantContext();
  if (!ctx) return jsonError('Necesitas iniciar sesión.', 401);

  const { id } = await context.params;

  // Solo se borran los que aún no se enviaron: un adjunto ya en la
  // conversación se va con su mensaje, no por separado.
  const removed = await deleteAttachment(ctx, id);

  if (removed) {
    try {
      await del(removed.blobPathname);
    } catch {
      // Un archivo huérfano cuesta unos bytes; fallar aquí no aporta.
    }
  }

  return new Response(null, { status: 204 });
}
