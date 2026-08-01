import { and, count, desc, eq, ilike, isNull, or } from 'drizzle-orm';
import { db } from '../client';
import {
  conversations,
  messages,
  type ConversationRow,
} from '../schema/chat';
import { assertTenantContext, type TenantContext } from '../../tenant/guard';

/**
 * Crea la conversación si no existe todavía.
 *
 * El cliente genera el identificador antes de enviar el primer mensaje, para
 * poder transmitir la respuesta sin un viaje extra al servidor. Por eso esta
 * función es idempotente y siempre acota por tenant: un identificador ajeno
 * nunca «se adopta», simplemente no aparece y se crea uno propio.
 */
export async function ensureConversation(
  ctx: TenantContext,
  conversationId: string,
): Promise<ConversationRow> {
  assertTenantContext(ctx, 'ensureConversation');

  const existing = await getConversation(ctx, conversationId);
  if (existing) return existing;

  const [row] = await db
    .insert(conversations)
    .values({
      id: conversationId,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
    })
    .onConflictDoNothing()
    .returning();

  if (row) return row;

  // Conflicto: la fila existe pero es de otro tenant o de otra persona.
  // Se crea una nueva con identificador propio en vez de exponer la ajena.
  const [fallback] = await db
    .insert(conversations)
    .values({ tenantId: ctx.tenantId, userId: ctx.userId })
    .returning();

  if (!fallback) {
    throw new Error('No se pudo crear la conversación.');
  }

  return fallback;
}

export async function getConversation(
  ctx: TenantContext,
  conversationId: string,
): Promise<ConversationRow | null> {
  assertTenantContext(ctx, 'getConversation');

  const [row] = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.id, conversationId),
        eq(conversations.tenantId, ctx.tenantId),
        eq(conversations.userId, ctx.userId),
      ),
    )
    .limit(1);

  return row ?? null;
}

export type ListConversationsOptions = {
  includeArchived?: boolean;
  search?: string;
  limit?: number;
};

export async function listConversations(
  ctx: TenantContext,
  options: ListConversationsOptions = {},
): Promise<ConversationRow[]> {
  assertTenantContext(ctx, 'listConversations');

  const search = options.search?.trim();

  const filters = [
    eq(conversations.tenantId, ctx.tenantId),
    eq(conversations.userId, ctx.userId),
  ];

  if (!options.includeArchived) {
    filters.push(eq(conversations.status, 'active'));
  }

  if (search) {
    const pattern = `%${search}%`;
    const titleMatch = ilike(conversations.title, pattern);
    const matched = or(titleMatch);
    if (matched) filters.push(matched);
  }

  return db
    .select()
    .from(conversations)
    .where(and(...filters))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(Math.min(Math.max(options.limit ?? 50, 1), 200));
}

export async function renameConversation(
  ctx: TenantContext,
  conversationId: string,
  title: string,
): Promise<ConversationRow> {
  assertTenantContext(ctx, 'renameConversation');

  const trimmed = title.trim().slice(0, 200);
  if (trimmed.length === 0) {
    throw new Error('El título no puede quedar vacío.');
  }

  const [row] = await db
    .update(conversations)
    .set({ title: trimmed })
    .where(
      and(
        eq(conversations.id, conversationId),
        eq(conversations.tenantId, ctx.tenantId),
        eq(conversations.userId, ctx.userId),
      ),
    )
    .returning();

  if (!row) {
    throw new Error('No se encontró la conversación.');
  }

  return row;
}

/** Título automático. No pisa un título que la persona haya escrito. */
export async function setAutoTitle(
  ctx: TenantContext,
  conversationId: string,
  title: string,
): Promise<void> {
  assertTenantContext(ctx, 'setAutoTitle');

  const trimmed = title.trim().slice(0, 200);
  if (trimmed.length === 0) return;

  await db
    .update(conversations)
    .set({ title: trimmed })
    .where(
      and(
        eq(conversations.id, conversationId),
        eq(conversations.tenantId, ctx.tenantId),
        eq(conversations.userId, ctx.userId),
        // Solo si sigue sin título: un título escrito por la persona manda
        // sobre el que proponga el modelo.
        isNull(conversations.title),
      ),
    );
}

export async function setConversationStatus(
  ctx: TenantContext,
  conversationId: string,
  status: ConversationRow['status'],
): Promise<void> {
  assertTenantContext(ctx, 'setConversationStatus');

  await db
    .update(conversations)
    .set({ status })
    .where(
      and(
        eq(conversations.id, conversationId),
        eq(conversations.tenantId, ctx.tenantId),
        eq(conversations.userId, ctx.userId),
      ),
    );
}

export async function deleteConversation(
  ctx: TenantContext,
  conversationId: string,
): Promise<void> {
  assertTenantContext(ctx, 'deleteConversation');

  // Los mensajes se van en cascada por la llave foránea.
  await db
    .delete(conversations)
    .where(
      and(
        eq(conversations.id, conversationId),
        eq(conversations.tenantId, ctx.tenantId),
        eq(conversations.userId, ctx.userId),
      ),
    );
}

export async function touchConversation(
  ctx: TenantContext,
  conversationId: string,
): Promise<void> {
  assertTenantContext(ctx, 'touchConversation');

  await db
    .update(conversations)
    .set({ lastMessageAt: new Date() })
    .where(
      and(
        eq(conversations.id, conversationId),
        eq(conversations.tenantId, ctx.tenantId),
      ),
    );
}

export async function countMessages(
  ctx: TenantContext,
  conversationId: string,
): Promise<number> {
  assertTenantContext(ctx, 'countMessages');

  const [row] = await db
    .select({ total: count() })
    .from(messages)
    .where(
      and(
        eq(messages.tenantId, ctx.tenantId),
        eq(messages.conversationId, conversationId),
      ),
    );

  return row?.total ?? 0;
}
