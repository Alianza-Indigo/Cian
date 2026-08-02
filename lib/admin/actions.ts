'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { assertSuperadmin, assertTenantAdmin } from './access';
import {
  activatePromptVersion,
  createPromptVersion,
} from '../db/repositories/prompts';
import { recordAudit } from '../db/repositories/audit';
import { invalidateModelCache } from '../ai/resolve-model';
import { saveLibraryResource, removeLibraryResource } from './library';
import { LIBRARY_CATEGORIES } from '../library/types';
import { MODEL_PURPOSES } from '../billing/types';

export type AdminActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };

// --- Prompts -----------------------------------------------------------------

const promptSchema = z.object({
  key: z.string().min(1).max(120),
  content: z.string().min(1).max(50_000),
});

/**
 * Guarda una versión nueva del prompt y la activa.
 *
 * Criterio del PRD: «editar un prompt desde el panel cambia el comportamiento
 * del asistente sin redeploy». Lo que lo hace cierto es la invalidación de la
 * caché de KV justo después: sin eso, el cambio tardaría hasta cinco minutos
 * en verse y parecería que no se guardó.
 */
export async function savePromptAction(
  input: unknown,
): Promise<AdminActionResult> {
  const parsed = promptSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Revisa el contenido.' };

  try {
    const admin = await assertSuperadmin('savePrompt');
    const result = await createPromptVersion(
      admin.ctx,
      parsed.data.key,
      parsed.data.content,
    );

    await invalidatePromptCache(parsed.data.key);

    await recordAudit(admin.ctx, {
      action: 'admin.prompt_save',
      entity: 'prompt',
      metadata: { key: parsed.data.key, version: result.row.version },
    });

    revalidatePath('/admin/prompts');

    return {
      ok: true,
      message: result.created
        ? `Guardado como versión ${result.row.version} y activado.`
        : 'No había cambios: se conserva la versión activa.',
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'No pudimos guardarlo.',
    };
  }
}

const rollbackSchema = z.object({
  key: z.string().min(1).max(120),
  version: z.number().int().min(1),
});

/** Vuelve a una versión anterior. Criterio: «el rollback funciona». */
export async function rollbackPromptAction(
  input: unknown,
): Promise<AdminActionResult> {
  const parsed = rollbackSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Versión no válida.' };

  try {
    const admin = await assertSuperadmin('rollbackPrompt');
    await activatePromptVersion(admin.ctx, parsed.data.key, parsed.data.version);

    await invalidatePromptCache(parsed.data.key);

    await recordAudit(admin.ctx, {
      action: 'admin.prompt_rollback',
      entity: 'prompt',
      metadata: { key: parsed.data.key, version: parsed.data.version },
    });

    revalidatePath('/admin/prompts');
    return { ok: true, message: `Activada la versión ${parsed.data.version}.` };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'No pudimos volver atrás.',
    };
  }
}

/** La caché de prompts vive en `lib/ai/prompts.ts` con este prefijo. */
async function invalidatePromptCache(key: string): Promise<void> {
  const { kvSet } = await import('../kv');
  await kvSet(`prompt:${key}`, '', 1);
}

// --- Modelos -----------------------------------------------------------------

const modelCacheSchema = z.object({
  purpose: z.enum(MODEL_PURPOSES),
  global: z.boolean().default(false),
});

/** Tira la caché tras guardar un modelo, para que el cambio se note ya. */
export async function refreshModelCacheAction(
  input: unknown,
): Promise<AdminActionResult> {
  const parsed = modelCacheSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Propósito no válido.' };

  try {
    const admin = await assertTenantAdmin('refreshModelCache');
    await invalidateModelCache(
      parsed.data.global ? null : admin.ctx.tenantId,
      parsed.data.purpose,
    );

    revalidatePath('/admin/modelos');
    return { ok: true, message: 'Listo. El cambio ya está activo.' };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'No pudimos refrescarlo.',
    };
  }
}

// --- Biblioteca --------------------------------------------------------------

const resourceSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(120)
    .regex(
      /^[a-z0-9-]+$/,
      'El identificador solo admite minúsculas, números y guiones.',
    ),
  title: z.string().min(1).max(300),
  category: z.enum(LIBRARY_CATEGORIES),
  tags: z.array(z.string().min(1).max(60)).max(20).default([]),
  source: z.string().max(300).optional(),
  content: z.string().min(20).max(200_000),
});

/**
 * Crea o actualiza un recurso de la biblioteca desde el panel.
 *
 * Es lo que responde a una petición explícita: no debería hacer falta editar
 * archivos del repositorio para publicar contenido. Los recursos creados aquí
 * son globales —visibles para todo CIAN— y por eso los toca solo el
 * superadmin.
 *
 * El indexado —trocear y calcular embeddings— ocurre dentro y puede tardar unos
 * segundos: son varias llamadas al modelo de embeddings.
 */
export async function saveLibraryResourceAction(
  input: unknown,
): Promise<AdminActionResult> {
  const parsed = resourceSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Revisa los campos.',
    };
  }

  try {
    const admin = await assertSuperadmin('saveLibraryResource');
    const result = await saveLibraryResource(parsed.data);

    await recordAudit(admin.ctx, {
      action: 'admin.library_save',
      entity: 'library_resource',
      metadata: {
        slug: parsed.data.slug,
        indexado: result.indexed,
        fragmentos: result.chunks,
      },
    });

    revalidatePath('/admin/biblioteca');
    revalidatePath('/biblioteca');

    return {
      ok: true,
      message: result.indexed
        ? `Publicado e indexado en ${result.chunks} fragmentos.`
        : 'Guardado. El contenido no cambió, así que no hizo falta reindexar.',
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'No pudimos publicarlo.',
    };
  }
}

export async function deleteLibraryResourceAction(
  slug: string,
): Promise<AdminActionResult> {
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return { ok: false, error: 'Identificador no válido.' };
  }

  try {
    const admin = await assertSuperadmin('deleteLibraryResource');
    await removeLibraryResource(slug);

    await recordAudit(admin.ctx, {
      action: 'admin.library_delete',
      entity: 'library_resource',
      metadata: { slug },
    });

    revalidatePath('/admin/biblioteca');
    revalidatePath('/biblioteca');
    return { ok: true, message: 'Recurso retirado de la biblioteca.' };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'No pudimos retirarlo.',
    };
  }
}
