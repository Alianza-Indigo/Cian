'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireTenantContext } from '../tenant/context';
import {
  deleteEducationItem,
  getEducationItem,
  linkEducationDocument,
} from '../db/repositories/education';
import { createDocument } from '../db/repositories/documents';
import { runDocumentGeneration } from '../documents/generate';
import { educationItemToMarkdown } from './education-export';
import { indexLibrary } from './index-content';

export type EducationActionResult =
  | { ok: true; documentId?: string }
  | { ok: false; error: string };

const idSchema = z.uuid();

/**
 * Exporta un material educativo a PDF.
 *
 * Se espera el resultado, como en el resto de exportaciones que dispara una
 * persona: acaba de pulsar un botón y quiere el archivo.
 */
export async function exportEducationItemAction(
  itemId: string,
): Promise<EducationActionResult> {
  if (!idSchema.safeParse(itemId).success) {
    return { ok: false, error: 'Material no válido.' };
  }

  try {
    const ctx = await requireTenantContext();

    const item = await getEducationItem(ctx, itemId);
    if (!item) return { ok: false, error: 'No encontramos el material.' };

    // Las agendas visuales se imprimen y se pegan; el resto son informes.
    const type = item.kind === 'agenda_visual' ? 'material_visual' : 'guia';

    const { document } = await createDocument(ctx, {
      type,
      title: item.title,
      format: 'pdf',
      sourceContent: educationItemToMarkdown(item),
    });

    await runDocumentGeneration(ctx, document.id);
    await linkEducationDocument(ctx, itemId, document.id);

    revalidatePath('/educacion');
    revalidatePath('/documentos');

    return { ok: true, documentId: document.id };
  } catch {
    return { ok: false, error: 'No pudimos exportar el material.' };
  }
}

export async function deleteEducationItemAction(
  itemId: string,
): Promise<EducationActionResult> {
  if (!idSchema.safeParse(itemId).success) {
    return { ok: false, error: 'Material no válido.' };
  }

  try {
    const ctx = await requireTenantContext();
    await deleteEducationItem(ctx, itemId);
    revalidatePath('/educacion');
    return { ok: true };
  } catch {
    return { ok: false, error: 'No pudimos eliminar el material.' };
  }
}

/**
 * Reindexado manual de la biblioteca.
 *
 * Existe además del cron para no tener que esperar al lunes tras publicar
 * contenido nuevo. Solo `admin` u `owner`: reindexar cuesta embeddings.
 */
export async function reindexLibraryAction(): Promise<
  { ok: true; indexed: number; skipped: number } | { ok: false; error: string }
> {
  try {
    const ctx = await requireTenantContext();

    if (ctx.role !== 'owner' && ctx.role !== 'admin') {
      return { ok: false, error: 'No tienes permiso para reindexar.' };
    }

    const report = await indexLibrary();
    revalidatePath('/biblioteca');

    return { ok: true, indexed: report.indexed, skipped: report.skipped };
  } catch {
    return { ok: false, error: 'No pudimos reindexar la biblioteca.' };
  }
}
