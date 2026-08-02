import { and, desc, eq } from 'drizzle-orm';
import { db } from '../client';
import { educationItems, type EducationItemRow } from '../schema/library';
import { assertTenantContext, type TenantContext } from '../../tenant/guard';
import type { EducationKind, EducationPayload } from '../../library/types';

export type CreateEducationItemInput = {
  kind: EducationKind;
  title: string;
  payload: EducationPayload;
};

export async function createEducationItem(
  ctx: TenantContext,
  input: CreateEducationItemInput,
): Promise<EducationItemRow> {
  assertTenantContext(ctx, 'createEducationItem');

  const title = input.title.trim().slice(0, 200);
  if (title.length === 0) throw new Error('El material necesita un título.');

  const [row] = await db
    .insert(educationItems)
    .values({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      kind: input.kind,
      title,
      payload: input.payload,
    })
    .returning();

  if (!row) throw new Error('No se pudo guardar el material.');
  return row;
}

export async function getEducationItem(
  ctx: TenantContext,
  itemId: string,
): Promise<EducationItemRow | null> {
  assertTenantContext(ctx, 'getEducationItem');

  const [row] = await db
    .select()
    .from(educationItems)
    .where(
      and(
        eq(educationItems.id, itemId),
        eq(educationItems.tenantId, ctx.tenantId),
        eq(educationItems.userId, ctx.userId),
      ),
    )
    .limit(1);

  return row ?? null;
}

export async function listEducationItems(
  ctx: TenantContext,
  options: { kind?: EducationKind; limit?: number } = {},
): Promise<EducationItemRow[]> {
  assertTenantContext(ctx, 'listEducationItems');

  const filters = [
    eq(educationItems.tenantId, ctx.tenantId),
    eq(educationItems.userId, ctx.userId),
  ];

  if (options.kind) filters.push(eq(educationItems.kind, options.kind));

  return db
    .select()
    .from(educationItems)
    .where(and(...filters))
    .orderBy(desc(educationItems.createdAt))
    .limit(Math.min(Math.max(options.limit ?? 100, 1), 200));
}

export async function linkEducationDocument(
  ctx: TenantContext,
  itemId: string,
  documentId: string,
): Promise<void> {
  assertTenantContext(ctx, 'linkEducationDocument');

  await db
    .update(educationItems)
    .set({ documentId })
    .where(
      and(
        eq(educationItems.id, itemId),
        eq(educationItems.tenantId, ctx.tenantId),
        eq(educationItems.userId, ctx.userId),
      ),
    );
}

export async function deleteEducationItem(
  ctx: TenantContext,
  itemId: string,
): Promise<void> {
  assertTenantContext(ctx, 'deleteEducationItem');

  await db
    .delete(educationItems)
    .where(
      and(
        eq(educationItems.id, itemId),
        eq(educationItems.tenantId, ctx.tenantId),
        eq(educationItems.userId, ctx.userId),
      ),
    );
}
