'use server';

import { revalidatePath } from 'next/cache';
import { del } from '@vercel/blob';
import { z } from 'zod';
import { requireTenantContext } from '../tenant/context';
import {
  deleteDocument,
  renameDocument,
  startRegeneration,
} from '../db/repositories/documents';
import { recordAudit } from '../db/repositories/audit';
import { runDocumentGeneration } from './generate';

export type DocumentActionResult = { ok: true } | { ok: false; error: string };

const idSchema = z.uuid();

export async function renameDocumentAction(
  documentId: string,
  title: string,
): Promise<DocumentActionResult> {
  const parsed = idSchema.safeParse(documentId);
  if (!parsed.success) return { ok: false, error: 'Documento no válido.' };

  try {
    const ctx = await requireTenantContext();
    await renameDocument(ctx, parsed.data, title);
    revalidatePath('/documentos');
    return { ok: true };
  } catch {
    return { ok: false, error: 'No pudimos cambiar el nombre.' };
  }
}

export async function deleteDocumentAction(
  documentId: string,
): Promise<DocumentActionResult> {
  const parsed = idSchema.safeParse(documentId);
  if (!parsed.success) return { ok: false, error: 'Documento no válido.' };

  try {
    const ctx = await requireTenantContext();
    const removed = await deleteDocument(ctx, parsed.data);

    // El archivo se borra después de la fila: si esto falla, queda un huérfano
    // en el store, no un documento inaccesible en la biblioteca.
    if (removed?.blobPathname) {
      try {
        await del(removed.blobPathname);
      } catch {
        // Un archivo huérfano cuesta unos bytes y nada más.
      }
    }

    await recordAudit(ctx, {
      action: 'document.deleted',
      entity: 'document',
      entityId: parsed.data,
      metadata: removed ? { folio: removed.folio, format: removed.format } : undefined,
    });

    revalidatePath('/documentos');
    return { ok: true };
  } catch {
    return { ok: false, error: 'No pudimos eliminar el documento.' };
  }
}

/**
 * Vuelve a generar el documento con instrucciones nuevas.
 *
 * El original se conserva hasta que la versión nueva está arriba: perder un
 * documento por una instrucción mal entendida sería el peor resultado.
 */
export async function regenerateDocumentAction(
  documentId: string,
  revisionNote: string,
): Promise<DocumentActionResult> {
  const parsed = idSchema.safeParse(documentId);
  if (!parsed.success) return { ok: false, error: 'Documento no válido.' };

  try {
    const ctx = await requireTenantContext();
    await startRegeneration(ctx, parsed.data, revisionNote);

    // Aquí sí se espera: esta acción la disparó la persona y quiere ver el
    // resultado, a diferencia de la generación desde el chat.
    await runDocumentGeneration(ctx, parsed.data);

    revalidatePath('/documentos');
    return { ok: true };
  } catch {
    return { ok: false, error: 'No pudimos regenerar el documento.' };
  }
}
