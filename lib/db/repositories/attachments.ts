import { and, eq, inArray, isNull, lt } from 'drizzle-orm';
import { db } from '../client';
import {
  messageAttachments,
  type MessageAttachmentRow,
} from '../schema/attachments';
import { assertTenantContext, type TenantContext } from '../../tenant/guard';
import type { AttachmentKind } from '../../attachments/types';

export type CreateAttachmentInput = {
  kind: AttachmentKind;
  filename: string;
  mime: string;
  sizeBytes: number;
  blobUrl: string;
  blobPathname: string;
  extractedText?: string | null;
};

export async function createAttachment(
  ctx: TenantContext,
  input: CreateAttachmentInput,
): Promise<MessageAttachmentRow> {
  assertTenantContext(ctx, 'createAttachment');

  const [row] = await db
    .insert(messageAttachments)
    .values({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      kind: input.kind,
      filename: input.filename.slice(0, 300),
      mime: input.mime,
      sizeBytes: input.sizeBytes,
      blobUrl: input.blobUrl,
      blobPathname: input.blobPathname,
      extractedText: input.extractedText ?? null,
    })
    .returning();

  if (!row) throw new Error('No se pudo registrar el adjunto.');
  return row;
}

export async function getAttachment(
  ctx: TenantContext,
  attachmentId: string,
): Promise<MessageAttachmentRow | null> {
  assertTenantContext(ctx, 'getAttachment');

  const [row] = await db
    .select()
    .from(messageAttachments)
    .where(
      and(
        eq(messageAttachments.id, attachmentId),
        eq(messageAttachments.tenantId, ctx.tenantId),
        eq(messageAttachments.userId, ctx.userId),
      ),
    )
    .limit(1);

  return row ?? null;
}

export async function getAttachments(
  ctx: TenantContext,
  attachmentIds: string[],
): Promise<MessageAttachmentRow[]> {
  assertTenantContext(ctx, 'getAttachments');
  if (attachmentIds.length === 0) return [];

  return db
    .select()
    .from(messageAttachments)
    .where(
      and(
        eq(messageAttachments.tenantId, ctx.tenantId),
        eq(messageAttachments.userId, ctx.userId),
        inArray(messageAttachments.id, attachmentIds),
      ),
    );
}

/** Liga los adjuntos ya subidos al mensaje que acaba de guardarse. */
export async function attachToMessage(
  ctx: TenantContext,
  messageId: string,
  attachmentIds: string[],
): Promise<void> {
  assertTenantContext(ctx, 'attachToMessage');
  if (attachmentIds.length === 0) return;

  await db
    .update(messageAttachments)
    .set({ messageId })
    .where(
      and(
        eq(messageAttachments.tenantId, ctx.tenantId),
        eq(messageAttachments.userId, ctx.userId),
        inArray(messageAttachments.id, attachmentIds),
        // Solo los que aún no tienen dueño: un adjunto no se reasigna.
        isNull(messageAttachments.messageId),
      ),
    );
}

export async function listAttachmentsForMessages(
  ctx: TenantContext,
  messageIds: string[],
): Promise<MessageAttachmentRow[]> {
  assertTenantContext(ctx, 'listAttachmentsForMessages');
  if (messageIds.length === 0) return [];

  return db
    .select()
    .from(messageAttachments)
    .where(
      and(
        eq(messageAttachments.tenantId, ctx.tenantId),
        inArray(messageAttachments.messageId, messageIds),
      ),
    );
}

export async function deleteAttachment(
  ctx: TenantContext,
  attachmentId: string,
): Promise<MessageAttachmentRow | null> {
  assertTenantContext(ctx, 'deleteAttachment');

  const [row] = await db
    .delete(messageAttachments)
    .where(
      and(
        eq(messageAttachments.id, attachmentId),
        eq(messageAttachments.tenantId, ctx.tenantId),
        eq(messageAttachments.userId, ctx.userId),
        // Un adjunto ya enviado forma parte de la conversación y no se borra
        // por separado: se va con su mensaje.
        isNull(messageAttachments.messageId),
      ),
    )
    .returning();

  return row ?? null;
}

/**
 * Adjuntos que se subieron y nunca se enviaron.
 *
 * Alguien elige un archivo, se arrepiente y cierra la pestaña: el archivo
 * queda huérfano ocupando espacio. Esta consulta los encuentra para poder
 * limpiarlos; el barrido programado llega con Vercel Cron en la Fase 8.
 */
export async function listOrphanAttachments(
  ctx: TenantContext,
  olderThan: Date,
  limit = 100,
): Promise<MessageAttachmentRow[]> {
  assertTenantContext(ctx, 'listOrphanAttachments');

  return db
    .select()
    .from(messageAttachments)
    .where(
      and(
        eq(messageAttachments.tenantId, ctx.tenantId),
        isNull(messageAttachments.messageId),
        lt(messageAttachments.createdAt, olderThan),
      ),
    )
    .limit(Math.min(Math.max(limit, 1), 500));
}
