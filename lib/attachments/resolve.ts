/**
 * Resolución de adjuntos antes de llamar al modelo.
 *
 * El cliente manda partes de archivo cuya URL apunta a **nuestra** ruta
 * (`/api/adjuntos/<id>`), que es privada. El modelo no puede descargarla, así
 * que aquí se sustituye por el contenido real:
 *
 *   - Imagen, PDF y audio → data URL en base64. Gemini los lee de forma nativa.
 *   - Word y texto → una parte de texto con lo extraído, porque el modelo no
 *     entiende esos formatos.
 *
 * Hacerlo del lado del servidor es lo que permite que los archivos sigan
 * siendo privados: nunca se expone una URL descargable sin sesión.
 */
import type { UIMessage } from 'ai';
import { getAttachments } from '../db/repositories/attachments';
import type { TenantContext } from '../tenant/guard';
import { ruleFor } from './types';
import type { MessageAttachmentRow } from '../db/schema/attachments';

const ATTACHMENT_URL_PATTERN = /^\/api\/adjuntos\/([0-9a-f-]{36})$/i;

/** Identificadores de adjunto referenciados en un conjunto de mensajes. */
export function collectAttachmentIds(messages: UIMessage[]): string[] {
  const ids = new Set<string>();

  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type !== 'file') continue;
      const url = (part as { url?: unknown }).url;
      if (typeof url !== 'string') continue;

      const match = ATTACHMENT_URL_PATTERN.exec(url);
      if (match?.[1]) ids.add(match[1]);
    }
  }

  return [...ids];
}

async function toDataUrl(
  attachment: MessageAttachmentRow,
  token: string,
): Promise<string | null> {
  try {
    const response = await fetch(attachment.blobUrl, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });

    if (!response.ok) return null;

    const bytes = Buffer.from(await response.arrayBuffer());
    return `data:${attachment.mime};base64,${bytes.toString('base64')}`;
  } catch {
    return null;
  }
}

/**
 * Devuelve los mensajes con los adjuntos ya materializados.
 *
 * Si un adjunto no se puede recuperar, se sustituye por una nota de texto en
 * vez de desaparecer: el modelo debe saber que había un archivo y que no pudo
 * leerlo, para poder decirlo en vez de responder como si nada.
 */
export async function resolveAttachments(
  ctx: TenantContext,
  messages: UIMessage[],
): Promise<UIMessage[]> {
  const ids = collectAttachmentIds(messages);
  if (ids.length === 0) return messages;

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  const rows = await getAttachments(ctx, ids);
  const byId = new Map(rows.map((row) => [row.id, row]));

  const resolved = await Promise.all(
    messages.map(async (message) => {
      if (!message.parts.some((part) => part.type === 'file')) return message;

      const parts = await Promise.all(
        message.parts.map(async (part) => {
          if (part.type !== 'file') return part;

          const url = (part as { url?: unknown }).url;
          if (typeof url !== 'string') return part;

          const match = ATTACHMENT_URL_PATTERN.exec(url);
          const attachment = match?.[1] ? byId.get(match[1]) : undefined;

          if (!attachment) return part;

          const rule = ruleFor(attachment.mime);

          // Formatos que el modelo no entiende: va el texto extraído.
          if (!rule?.nativeToModel) {
            const text = attachment.extractedText;
            return {
              type: 'text' as const,
              text: text
                ? `Contenido del archivo adjunto «${attachment.filename}»:\n\n${text}`
                : `Se adjuntó el archivo «${attachment.filename}», pero no se pudo leer su contenido.`,
            };
          }

          if (!token) {
            return {
              type: 'text' as const,
              text: `Se adjuntó «${attachment.filename}», pero no se pudo abrir.`,
            };
          }

          const dataUrl = await toDataUrl(attachment, token);

          if (!dataUrl) {
            return {
              type: 'text' as const,
              text: `Se adjuntó «${attachment.filename}», pero no se pudo abrir.`,
            };
          }

          return {
            type: 'file' as const,
            mediaType: attachment.mime,
            filename: attachment.filename,
            url: dataUrl,
          };
        }),
      );

      return { ...message, parts } as UIMessage;
    }),
  );

  return resolved;
}
