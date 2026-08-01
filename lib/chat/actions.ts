'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireTenantContext } from '../tenant/context';
import {
  deleteConversation,
  renameConversation,
  setConversationStatus,
} from '../db/repositories/conversations';
import { recordAudit } from '../db/repositories/audit';

export type ActionResult = { ok: true } | { ok: false; error: string };

const idSchema = z.uuid();

export async function renameConversationAction(
  conversationId: string,
  title: string,
): Promise<ActionResult> {
  const parsed = idSchema.safeParse(conversationId);
  if (!parsed.success) return { ok: false, error: 'Conversación no válida.' };

  try {
    const ctx = await requireTenantContext();
    await renameConversation(ctx, parsed.data, title);
    revalidatePath('/', 'layout');
    return { ok: true };
  } catch {
    return { ok: false, error: 'No pudimos cambiar el nombre.' };
  }
}

export async function archiveConversationAction(
  conversationId: string,
  archived: boolean,
): Promise<ActionResult> {
  const parsed = idSchema.safeParse(conversationId);
  if (!parsed.success) return { ok: false, error: 'Conversación no válida.' };

  try {
    const ctx = await requireTenantContext();
    await setConversationStatus(ctx, parsed.data, archived ? 'archived' : 'active');
    revalidatePath('/', 'layout');
    return { ok: true };
  } catch {
    return { ok: false, error: 'No pudimos archivar la conversación.' };
  }
}

export async function deleteConversationAction(
  conversationId: string,
): Promise<ActionResult> {
  const parsed = idSchema.safeParse(conversationId);
  if (!parsed.success) return { ok: false, error: 'Conversación no válida.' };

  try {
    const ctx = await requireTenantContext();
    await deleteConversation(ctx, parsed.data);

    // Se audita el borrado, sin guardar nada del contenido (regla 3.6).
    await recordAudit(ctx, {
      action: 'conversation.deleted',
      entity: 'conversation',
      entityId: parsed.data,
    });

    revalidatePath('/', 'layout');
    return { ok: true };
  } catch {
    return { ok: false, error: 'No pudimos eliminar la conversación.' };
  }
}

/** Borrar la conversación abierta debe sacarte de ella. */
export async function deleteConversationAndLeaveAction(
  conversationId: string,
): Promise<void> {
  const result = await deleteConversationAction(conversationId);
  if (result.ok) redirect('/');
}
