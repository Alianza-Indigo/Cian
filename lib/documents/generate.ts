/**
 * Ejecución de la generación de un documento.
 *
 * Corre en diferido (regla 3.3): el chat ya contestó y esto ocurre después,
 * despachado con `waitUntil`. Por eso nada de aquí puede propagar una
 * excepción hacia arriba — un fallo se registra en el trabajo y el documento
 * queda en `failed`, que es lo que la biblioteca sabe mostrar.
 */
import { put, del } from '@vercel/blob';
import { generatePdf } from './pdf';
import { generateDocx } from './docx';
import { generateMarkdown, generatePlainText } from './text';
import { findUnencodable } from './winansi';
import {
  DOCUMENT_MIME_TYPES,
  toFileName,
  type DocumentFormat,
  type DocumentType,
} from './types';
import {
  getDocument,
  markDocumentFailed,
  markDocumentReady,
} from '../db/repositories/documents';
import { getCurrentTenant } from '../db/repositories/tenants';
import type { TenantContext } from '../tenant/guard';

export type GenerateInput = {
  title: string;
  type: DocumentType;
  format: DocumentFormat;
  content: string;
  folio: string;
  tenantName: string;
  createdAt: Date;
};

/** Produce los bytes del documento en el formato pedido. */
export async function renderDocument(
  input: GenerateInput,
): Promise<Uint8Array> {
  switch (input.format) {
    case 'pdf':
      return generatePdf(input);
    case 'docx':
      return generateDocx(input);
    case 'md':
      return generateMarkdown(input);
    case 'txt':
      return generatePlainText(input);
  }
}

export function isBlobConfigured(): boolean {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  return typeof token === 'string' && token.trim().length > 0;
}

/**
 * Genera, sube y marca listo. Nunca lanza.
 *
 * El archivo se guarda con `access: 'private'`: la URL del store no es
 * suficiente para leerlo. La descarga pasa siempre por nuestra ruta, que
 * comprueba el tenant.
 */
export async function runDocumentGeneration(
  ctx: TenantContext,
  documentId: string,
): Promise<void> {
  try {
    const document = await getDocument(ctx, documentId);
    if (!document) return;

    if (!isBlobConfigured()) {
      await markDocumentFailed(
        ctx,
        documentId,
        'BLOB_READ_WRITE_TOKEN ausente: no hay store de archivos conectado.',
      );
      return;
    }

    const tenant = await getCurrentTenant(ctx);

    const content = document.revisionNote
      ? `${document.sourceContent}\n\n${document.revisionNote}`
      : document.sourceContent;

    if (document.format === 'pdf') {
      const lost = findUnencodable(content);
      if (lost.length > 0) {
        // No es un error: se sustituyen o descartan. Queda constancia porque
        // ayuda a entender por qué un documento salió distinto al texto.
        console.warn(
          `[documentos] ${documentId}: ${lost.length} caracteres fuera de WinAnsi saneados`,
        );
      }
    }

    const bytes = await renderDocument({
      title: document.title,
      type: document.type,
      format: document.format,
      content,
      folio: document.folio,
      tenantName: tenant?.name ?? 'Espacio personal',
      createdAt: document.createdAt,
    });

    // La ruta lleva el tenant por delante para que el store quede legible al
    // auditarlo, y un sufijo aleatorio para no colisionar al regenerar.
    const pathname = `documentos/${ctx.tenantId}/${documentId}/${toFileName(
      document.title,
      document.format,
    )}`;

    const uploaded = await put(pathname, Buffer.from(bytes), {
      access: 'private',
      contentType: DOCUMENT_MIME_TYPES[document.format],
      addRandomSuffix: true,
    });

    // Al regenerar, el archivo anterior deja de tener dueño: se borra después
    // de que el nuevo está arriba, nunca antes.
    const previousPathname = document.blobPathname;

    await markDocumentReady(ctx, documentId, {
      blobUrl: uploaded.url,
      blobPathname: uploaded.pathname,
      sizeBytes: bytes.byteLength,
    });

    if (previousPathname && previousPathname !== uploaded.pathname) {
      try {
        await del(previousPathname);
      } catch {
        // Un archivo huérfano cuesta unos bytes; fallar aquí no aporta nada.
      }
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`[documentos] falló la generación de ${documentId} —`, detail);

    try {
      await markDocumentFailed(ctx, documentId, detail);
    } catch {
      // Si ni siquiera se puede marcar el fallo, no queda nada por hacer.
    }
  }
}
