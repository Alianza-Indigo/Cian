/**
 * Subida de adjuntos.
 *
 * El archivo se sube antes de enviar el mensaje: quien escribe adjunta
 * primero y redacta después. Por eso el adjunto nace sin `message_id` y se
 * liga al mensaje cuando este se guarda.
 *
 * Todo va a Blob con acceso privado. La validación de tipo y tamaño ocurre
 * aquí, del lado del servidor: el `accept` del selector de archivos es una
 * comodidad para la persona, no un control de seguridad.
 */
import { put } from '@vercel/blob';
import { getTenantContext } from '@/lib/tenant/context';
import { createAttachment } from '@/lib/db/repositories/attachments';
import { extractText } from '@/lib/attachments/extract';
import {
  MAX_ATTACHMENTS_PER_MESSAGE,
  validateAttachment,
} from '@/lib/attachments/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

/** Nombre de archivo seguro para la ruta del store. */
function safeName(name: string): string {
  return (
    name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9.\-_]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 100) || 'adjunto'
  );
}

export async function POST(request: Request): Promise<Response> {
  const ctx = await getTenantContext();
  if (!ctx) return jsonError('Necesitas iniciar sesión.', 401);

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return jsonError(
      'CIAN no tiene configurado su almacenamiento de archivos. Es un problema nuestro, no tuyo.',
      503,
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonError('No pudimos leer el archivo.', 400);
  }

  const files = formData.getAll('archivo').filter((item): item is File =>
    item instanceof File,
  );

  if (files.length === 0) {
    return jsonError('No llegó ningún archivo.', 400);
  }

  if (files.length > MAX_ATTACHMENTS_PER_MESSAGE) {
    return jsonError(
      `Puedes adjuntar hasta ${MAX_ATTACHMENTS_PER_MESSAGE} archivos por mensaje.`,
      400,
    );
  }

  const results = [];

  for (const file of files) {
    const validation = validateAttachment(file.type, file.size, file.name);

    if (!validation.ok) {
      return jsonError(validation.error, 415);
    }

    const bytes = new Uint8Array(await file.arrayBuffer());

    // Se revalida el tamaño real: `file.size` viene del cliente.
    const revalidated = validateAttachment(
      file.type,
      bytes.byteLength,
      file.name,
    );
    if (!revalidated.ok) {
      return jsonError(revalidated.error, 415);
    }

    const extractedText = extractText(validation.mimeType, bytes);

    const uploaded = await put(
      `adjuntos/${ctx.tenantId}/${safeName(file.name)}`,
      Buffer.from(bytes),
      {
        access: 'private',
        contentType: validation.mimeType,
        addRandomSuffix: true,
      },
    );

    const row = await createAttachment(ctx, {
      kind: validation.kind,
      filename: file.name,
      mime: validation.mimeType,
      sizeBytes: bytes.byteLength,
      blobUrl: uploaded.url,
      blobPathname: uploaded.pathname,
      extractedText,
    });

    results.push({
      id: row.id,
      kind: row.kind,
      filename: row.filename,
      mediaType: row.mime,
      sizeBytes: row.sizeBytes,
      // La URL apunta a nuestra ruta, nunca al store.
      url: `/api/adjuntos/${row.id}`,
    });
  }

  return Response.json({ adjuntos: results }, { status: 201 });
}
