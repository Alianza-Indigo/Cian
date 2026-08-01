import { and, asc, eq, gte, inArray } from 'drizzle-orm';
import { db } from '../client';
import { messages, type MessagePart, type MessageRow } from '../schema/chat';
import { assertTenantContext, type TenantContext } from '../../tenant/guard';

export type AppendMessageInput = {
  conversationId: string;
  role: MessageRow['role'];
  parts: MessagePart[];
  model?: string | null;
  tokenInput?: number | null;
  tokenOutput?: number | null;
  /** Se respeta si viene, para que cliente y base compartan identificador. */
  id?: string;
};

export async function appendMessage(
  ctx: TenantContext,
  input: AppendMessageInput,
): Promise<MessageRow> {
  assertTenantContext(ctx, 'appendMessage');

  const [row] = await db
    .insert(messages)
    .values({
      ...(input.id ? { id: input.id } : {}),
      tenantId: ctx.tenantId,
      conversationId: input.conversationId,
      role: input.role,
      parts: input.parts,
      model: input.model ?? null,
      tokenInput: input.tokenInput ?? null,
      tokenOutput: input.tokenOutput ?? null,
    })
    .onConflictDoNothing()
    .returning();

  if (!row) {
    // Reintento del cliente con el mismo identificador: no es un error.
    const existing = await getMessage(ctx, input.id ?? '');
    if (existing) return existing;
    throw new Error('No se pudo guardar el mensaje.');
  }

  return row;
}

export async function getMessage(
  ctx: TenantContext,
  messageId: string,
): Promise<MessageRow | null> {
  assertTenantContext(ctx, 'getMessage');
  if (!messageId) return null;

  const [row] = await db
    .select()
    .from(messages)
    .where(
      and(eq(messages.id, messageId), eq(messages.tenantId, ctx.tenantId)),
    )
    .limit(1);

  return row ?? null;
}

export async function listMessages(
  ctx: TenantContext,
  conversationId: string,
): Promise<MessageRow[]> {
  assertTenantContext(ctx, 'listMessages');

  return db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.tenantId, ctx.tenantId),
        eq(messages.conversationId, conversationId),
      ),
    )
    .orderBy(asc(messages.createdAt));
}

/**
 * Borra un mensaje y todo lo que vino después.
 *
 * Es lo que hace posible editar el último mensaje o reintentar una respuesta:
 * la conversación vuelve al punto anterior en vez de acumular intentos
 * fallidos que después confunden al modelo.
 */
export async function deleteFromMessage(
  ctx: TenantContext,
  conversationId: string,
  messageId: string,
): Promise<void> {
  assertTenantContext(ctx, 'deleteFromMessage');

  const target = await getMessage(ctx, messageId);
  if (!target || target.conversationId !== conversationId) return;

  await db
    .delete(messages)
    .where(
      and(
        eq(messages.tenantId, ctx.tenantId),
        eq(messages.conversationId, conversationId),
        gte(messages.createdAt, target.createdAt),
      ),
    );
}

export async function deleteMessages(
  ctx: TenantContext,
  messageIds: string[],
): Promise<void> {
  assertTenantContext(ctx, 'deleteMessages');
  if (messageIds.length === 0) return;

  await db
    .delete(messages)
    .where(
      and(
        eq(messages.tenantId, ctx.tenantId),
        inArray(messages.id, messageIds),
      ),
    );
}
