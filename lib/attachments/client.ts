/**
 * Subida de adjuntos desde el navegador.
 *
 * Vive aparte porque la usan dos caminos distintos: el selector de archivos y
 * el respaldo del dictado, que adjunta la grabación cuando no hay
 * reconocimiento de voz en el dispositivo.
 */
import type { AttachmentKind } from './types';

export type UploadedAttachment = {
  id: string;
  kind: AttachmentKind;
  filename: string;
  mediaType: string;
  sizeBytes: number;
  /** Apunta a nuestra ruta privada, nunca al store. */
  url: string;
};

export type UploadResult =
  | { ok: true; attachments: UploadedAttachment[] }
  | { ok: false; error: string };

export async function uploadAttachments(files: File[]): Promise<UploadResult> {
  if (files.length === 0) return { ok: true, attachments: [] };

  try {
    const body = new FormData();
    for (const file of files) body.append('archivo', file);

    const response = await fetch('/api/adjuntos', { method: 'POST', body });
    const data = (await response.json()) as
      | { adjuntos: UploadedAttachment[] }
      | { error: string };

    if (!response.ok || 'error' in data) {
      return {
        ok: false,
        error: 'error' in data ? data.error : 'No pudimos subir el archivo.',
      };
    }

    return { ok: true, attachments: data.adjuntos };
  } catch {
    return { ok: false, error: 'Se perdió la conexión al subir el archivo.' };
  }
}

/** Descarta un adjunto que aún no se envió. */
export async function discardAttachment(id: string): Promise<void> {
  try {
    await fetch(`/api/adjuntos/${id}`, { method: 'DELETE' });
  } catch {
    // Si falla, queda huérfano y lo barrerá la limpieza. No vale interrumpir.
  }
}
