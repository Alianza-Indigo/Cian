import { and, desc, eq, ilike, or } from 'drizzle-orm';
import { db } from '../client';
import { userMemories, type UserMemoryRow } from '../schema/memories';
import { assertTenantContext, type TenantContext } from '../../tenant/guard';

export type SaveMemoryInput = {
  key: string;
  value: string;
  sourceMessageId?: string | null;
  confirmedByUser?: boolean;
};

/** Normaliza la clave para que «Ruidos Fuertes» y «ruidos fuertes» sean una. */
function normalizeKey(key: string): string {
  return key
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^\p{L}\p{N}_]/gu, '')
    .slice(0, 80);
}

export async function saveMemory(
  ctx: TenantContext,
  input: SaveMemoryInput,
): Promise<UserMemoryRow> {
  assertTenantContext(ctx, 'saveMemory');

  const key = normalizeKey(input.key);
  const value = input.value.trim().slice(0, 2000);

  if (key.length === 0 || value.length === 0) {
    throw new Error('La memoria necesita una clave y un contenido.');
  }

  const [row] = await db
    .insert(userMemories)
    .values({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      key,
      value,
      sourceMessageId: input.sourceMessageId ?? null,
      confirmedByUser: input.confirmedByUser ?? false,
    })
    .onConflictDoUpdate({
      target: [userMemories.tenantId, userMemories.userId, userMemories.key],
      set: {
        value,
        sourceMessageId: input.sourceMessageId ?? null,
        confirmedByUser: input.confirmedByUser ?? false,
        updatedAt: new Date(),
      },
    })
    .returning();

  if (!row) {
    throw new Error('No se pudo guardar la memoria.');
  }

  return row;
}

export async function listMemories(
  ctx: TenantContext,
  limit = 200,
): Promise<UserMemoryRow[]> {
  assertTenantContext(ctx, 'listMemories');

  return db
    .select()
    .from(userMemories)
    .where(
      and(
        eq(userMemories.tenantId, ctx.tenantId),
        eq(userMemories.userId, ctx.userId),
      ),
    )
    .orderBy(desc(userMemories.updatedAt))
    .limit(Math.min(Math.max(limit, 1), 500));
}

/**
 * Búsqueda por texto sobre clave y contenido.
 *
 * Es una búsqueda simple a propósito: la memoria de una persona son decenas de
 * apuntes, no miles. Cuando la Fase 6 traiga `pgvector` para la biblioteca,
 * valdrá la pena reconsiderar si esto también debe ser semántico.
 */
export async function searchMemories(
  ctx: TenantContext,
  query: string,
  limit = 20,
): Promise<UserMemoryRow[]> {
  assertTenantContext(ctx, 'searchMemories');

  const trimmed = query.trim();
  if (trimmed.length === 0) return listMemories(ctx, limit);

  const pattern = `%${trimmed}%`;
  const matches = or(
    ilike(userMemories.key, pattern),
    ilike(userMemories.value, pattern),
  );

  const filters = [
    eq(userMemories.tenantId, ctx.tenantId),
    eq(userMemories.userId, ctx.userId),
  ];
  if (matches) filters.push(matches);

  return db
    .select()
    .from(userMemories)
    .where(and(...filters))
    .orderBy(desc(userMemories.updatedAt))
    .limit(Math.min(Math.max(limit, 1), 100));
}

export async function updateMemory(
  ctx: TenantContext,
  memoryId: string,
  value: string,
): Promise<UserMemoryRow> {
  assertTenantContext(ctx, 'updateMemory');

  const trimmed = value.trim().slice(0, 2000);
  if (trimmed.length === 0) {
    throw new Error('El contenido de la memoria no puede quedar vacío.');
  }

  const [row] = await db
    .update(userMemories)
    .set({ value: trimmed, confirmedByUser: true, updatedAt: new Date() })
    .where(
      and(
        eq(userMemories.id, memoryId),
        eq(userMemories.tenantId, ctx.tenantId),
        eq(userMemories.userId, ctx.userId),
      ),
    )
    .returning();

  if (!row) {
    throw new Error('No se encontró esa memoria.');
  }

  return row;
}

export async function deleteMemory(
  ctx: TenantContext,
  memoryId: string,
): Promise<void> {
  assertTenantContext(ctx, 'deleteMemory');

  await db
    .delete(userMemories)
    .where(
      and(
        eq(userMemories.id, memoryId),
        eq(userMemories.tenantId, ctx.tenantId),
        eq(userMemories.userId, ctx.userId),
      ),
    );
}

export async function deleteAllMemories(ctx: TenantContext): Promise<number> {
  assertTenantContext(ctx, 'deleteAllMemories');

  const deleted = await db
    .delete(userMemories)
    .where(
      and(
        eq(userMemories.tenantId, ctx.tenantId),
        eq(userMemories.userId, ctx.userId),
      ),
    )
    .returning({ id: userMemories.id });

  return deleted.length;
}

export { normalizeKey as __normalizeMemoryKeyForTests };
