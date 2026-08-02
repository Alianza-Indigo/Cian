/**
 * Acceso a la biblioteca.
 *
 * Dos particularidades frente al resto de repositorios:
 *
 * 1. **La biblioteca es global.** Las lecturas devuelven el contenido de CIAN
 *    (`tenant_id IS NULL`) más el del tenant que consulta. Por eso las
 *    funciones siguen recibiendo `TenantContext`: no para acotar todo a un
 *    tenant, sino para saber **qué contenido propio** puede ver además del
 *    global. Un recurso de otro tenant nunca aparece.
 *
 * 2. **La búsqueda degrada.** Si no hay embeddings —sin clave del modelo, o el
 *    proveedor falla— se cae a búsqueda por texto en vez de no devolver nada.
 *    Peor recuperación es mejor que ninguna.
 */
import { and, cosineDistance, desc, eq, gt, ilike, isNull, or, sql } from 'drizzle-orm';
import { db } from '../client';
import {
  libraryChunks,
  libraryResources,
  type LibraryResourceRow,
} from '../schema/library';
import { assertTenantContext, type TenantContext } from '../../tenant/guard';
import type { LibraryCategory } from '../../library/types';
import { embedQuery } from '../../library/embeddings';

export type SearchResult = {
  resourceId: string;
  slug: string;
  title: string;
  category: LibraryCategory;
  source: string | null;
  excerpt: string;
  /** 0 a 1. Solo con búsqueda vectorial; `null` con el respaldo de texto. */
  similarity: number | null;
};

/** Visibilidad: lo global más lo propio del tenant. Nunca lo de otro. */
function visibilityFilter(tenantId: string) {
  return or(isNull(libraryChunks.tenantId), eq(libraryChunks.tenantId, tenantId));
}

/**
 * Búsqueda semántica con respaldo textual.
 *
 * El umbral de similitud descarta los fragmentos que el índice devuelve por
 * cercanía relativa pero que no hablan del tema: sin él, cualquier consulta
 * trae siempre cinco resultados, aunque ninguno venga a cuento.
 */
const SIMILARITY_THRESHOLD = 0.35;

export async function searchLibrary(
  ctx: TenantContext,
  query: string,
  options: { category?: LibraryCategory; limit?: number } = {},
): Promise<SearchResult[]> {
  assertTenantContext(ctx, 'searchLibrary');

  const trimmed = query.trim();
  if (trimmed.length === 0) return [];

  const limit = Math.min(Math.max(options.limit ?? 5, 1), 20);
  const vector = await embedQuery(trimmed);

  if (vector) {
    const similarity = sql<number>`1 - (${cosineDistance(libraryChunks.embedding, vector)})`;

    const filters = [visibilityFilter(ctx.tenantId), gt(similarity, SIMILARITY_THRESHOLD)];
    if (options.category) {
      filters.push(eq(libraryResources.category, options.category));
    }

    const rows = await db
      .select({
        resourceId: libraryResources.id,
        slug: libraryResources.slug,
        title: libraryResources.title,
        category: libraryResources.category,
        source: libraryResources.source,
        excerpt: libraryChunks.content,
        similarity,
      })
      .from(libraryChunks)
      .innerJoin(
        libraryResources,
        eq(libraryResources.id, libraryChunks.resourceId),
      )
      .where(and(...filters))
      .orderBy(desc(similarity))
      .limit(limit);

    if (rows.length > 0) return rows;
    // Sin resultados por encima del umbral: se intenta por texto antes de
    // decir que no hay nada.
  }

  return searchLibraryByText(ctx, trimmed, options);
}

/** Respaldo: coincidencia de texto en título y contenido. */
export async function searchLibraryByText(
  ctx: TenantContext,
  query: string,
  options: { category?: LibraryCategory; limit?: number } = {},
): Promise<SearchResult[]> {
  assertTenantContext(ctx, 'searchLibraryByText');

  const pattern = `%${query.trim()}%`;
  const limit = Math.min(Math.max(options.limit ?? 5, 1), 20);

  const matches = or(
    ilike(libraryResources.title, pattern),
    ilike(libraryChunks.content, pattern),
  );

  const filters = [visibilityFilter(ctx.tenantId)];
  if (matches) filters.push(matches);
  if (options.category) {
    filters.push(eq(libraryResources.category, options.category));
  }

  const rows = await db
    .select({
      resourceId: libraryResources.id,
      slug: libraryResources.slug,
      title: libraryResources.title,
      category: libraryResources.category,
      source: libraryResources.source,
      excerpt: libraryChunks.content,
    })
    .from(libraryChunks)
    .innerJoin(libraryResources, eq(libraryResources.id, libraryChunks.resourceId))
    .where(and(...filters))
    .limit(limit);

  return rows.map((row) => ({ ...row, similarity: null }));
}

export async function listLibraryResources(
  ctx: TenantContext,
  options: { category?: LibraryCategory; limit?: number } = {},
): Promise<LibraryResourceRow[]> {
  assertTenantContext(ctx, 'listLibraryResources');

  const filters = [
    or(
      isNull(libraryResources.tenantId),
      eq(libraryResources.tenantId, ctx.tenantId),
    ),
  ].filter((filter) => filter !== undefined);

  if (options.category) {
    filters.push(eq(libraryResources.category, options.category));
  }

  return db
    .select()
    .from(libraryResources)
    .where(and(...filters))
    .orderBy(libraryResources.title)
    .limit(Math.min(Math.max(options.limit ?? 100, 1), 300));
}

export async function getResourceBySlug(
  ctx: TenantContext,
  slug: string,
): Promise<LibraryResourceRow | null> {
  assertTenantContext(ctx, 'getResourceBySlug');

  const [row] = await db
    .select()
    .from(libraryResources)
    .where(
      and(
        eq(libraryResources.slug, slug),
        or(
          isNull(libraryResources.tenantId),
          eq(libraryResources.tenantId, ctx.tenantId),
        ),
      ),
    )
    .limit(1);

  return row ?? null;
}

// --- Indexado ---------------------------------------------------------------

export type UpsertResourceInput = {
  slug: string;
  title: string;
  category: LibraryCategory;
  tags: string[];
  source: string | null;
  reviewedAt: Date | null;
  content: string;
  contentHash: string;
  /** `null` para contenido global de CIAN. */
  tenantId?: string | null;
};

/**
 * Inserta o actualiza un recurso con sus fragmentos.
 *
 * **Criterio de aceptación: «reindexar la biblioteca completa no rompe
 * consultas en curso».** Por eso el reemplazo de fragmentos ocurre dentro de
 * una transacción y **por recurso**: mientras uno se reescribe, los demás
 * siguen consultables, y ese uno pasa de su versión vieja a la nueva sin
 * quedar vacío en medio.
 *
 * Devuelve `false` si el contenido no cambió, para no pagar embeddings de
 * balde.
 */
export async function upsertResourceWithChunks(
  input: UpsertResourceInput,
  chunks: Array<{ content: string; embedding: number[] | null }>,
): Promise<{ indexed: boolean; resourceId: string }> {
  /*
   * El recurso se busca **dentro de su ámbito**. Buscar solo por `slug` hacía
   * que un recurso propio de un espacio encontrara el global de CIAN con ese
   * nombre y lo pisara.
   */
  const scope = input.tenantId
    ? and(
        eq(libraryResources.slug, input.slug),
        eq(libraryResources.tenantId, input.tenantId),
      )
    : and(
        eq(libraryResources.slug, input.slug),
        isNull(libraryResources.tenantId),
      );

  const [existing] = await db
    .select({ id: libraryResources.id, contentHash: libraryResources.contentHash })
    .from(libraryResources)
    .where(scope)
    .limit(1);

  if (existing && existing.contentHash === input.contentHash) {
    return { indexed: false, resourceId: existing.id };
  }

  return db.transaction(async (tx) => {
    const [resource] = await tx
      .insert(libraryResources)
      .values({
        tenantId: input.tenantId ?? null,
        slug: input.slug,
        title: input.title,
        category: input.category,
        tags: input.tags,
        source: input.source,
        reviewedAt: input.reviewedAt,
        content: input.content,
        contentHash: input.contentHash,
      })
      .onConflictDoUpdate({
        // Cada ámbito tiene su propio índice parcial y hay que nombrarlo, o
        // Postgres no sabe cuál de los dos resuelve el conflicto.
        target: input.tenantId
          ? [libraryResources.tenantId, libraryResources.slug]
          : [libraryResources.slug],
        targetWhere: input.tenantId
          ? sql`${libraryResources.tenantId} is not null`
          : sql`${libraryResources.tenantId} is null`,
        set: {
          title: input.title,
          category: input.category,
          tags: input.tags,
          source: input.source,
          reviewedAt: input.reviewedAt,
          content: input.content,
          contentHash: input.contentHash,
          updatedAt: new Date(),
        },
      })
      .returning();

    if (!resource) throw new Error('No se pudo guardar el recurso.');

    await tx
      .delete(libraryChunks)
      .where(eq(libraryChunks.resourceId, resource.id));

    if (chunks.length > 0) {
      await tx.insert(libraryChunks).values(
        chunks.map((chunk, index) => ({
          resourceId: resource.id,
          tenantId: input.tenantId ?? null,
          chunkIndex: index,
          content: chunk.content,
          embedding: chunk.embedding,
        })),
      );
    }

    return { indexed: true, resourceId: resource.id };
  });
}

/** Recursos globales que ya no existen en el repositorio de contenido. */
export async function deleteGlobalResourcesNotIn(
  slugs: string[],
): Promise<number> {
  const rows = await db
    .select({ id: libraryResources.id, slug: libraryResources.slug })
    .from(libraryResources)
    .where(isNull(libraryResources.tenantId));

  const stale = rows.filter((row) => !slugs.includes(row.slug));

  for (const row of stale) {
    await db.delete(libraryResources).where(eq(libraryResources.id, row.id));
  }

  return stale.length;
}
