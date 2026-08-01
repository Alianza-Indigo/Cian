'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireTenantContext } from '../tenant/context';
import {
  deleteAllMemories,
  deleteMemory,
  updateMemory,
} from '../db/repositories/memories';
import { recordAudit } from '../db/repositories/audit';

export type MemoryActionResult = { ok: true } | { ok: false; error: string };

const idSchema = z.uuid();

export async function updateMemoryAction(
  memoryId: string,
  value: string,
): Promise<MemoryActionResult> {
  const parsed = idSchema.safeParse(memoryId);
  if (!parsed.success) return { ok: false, error: 'Memoria no válida.' };

  try {
    const ctx = await requireTenantContext();
    await updateMemory(ctx, parsed.data, value);
    revalidatePath('/memorias');
    return { ok: true };
  } catch {
    return { ok: false, error: 'No pudimos guardar el cambio.' };
  }
}

export async function deleteMemoryAction(
  memoryId: string,
): Promise<MemoryActionResult> {
  const parsed = idSchema.safeParse(memoryId);
  if (!parsed.success) return { ok: false, error: 'Memoria no válida.' };

  try {
    const ctx = await requireTenantContext();
    await deleteMemory(ctx, parsed.data);

    // Se registra que se borró, nunca qué decía (regla 3.6).
    await recordAudit(ctx, {
      action: 'memory.deleted',
      entity: 'user_memory',
      entityId: parsed.data,
    });

    revalidatePath('/memorias');
    return { ok: true };
  } catch {
    return { ok: false, error: 'No pudimos borrar esa memoria.' };
  }
}

export async function deleteAllMemoriesAction(): Promise<MemoryActionResult> {
  try {
    const ctx = await requireTenantContext();
    const total = await deleteAllMemories(ctx);

    await recordAudit(ctx, {
      action: 'memory.deleted_all',
      entity: 'user_memory',
      metadata: { total },
    });

    revalidatePath('/memorias');
    return { ok: true };
  } catch {
    return { ok: false, error: 'No pudimos borrar tus memorias.' };
  }
}
