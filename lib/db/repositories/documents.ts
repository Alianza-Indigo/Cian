import { and, count, desc, eq, gte } from 'drizzle-orm';
import { db } from '../client';
import {
  documentJobs,
  documents,
  type DocumentJobRow,
  type DocumentRow,
} from '../schema/documents';
import { assertTenantContext, type TenantContext } from '../../tenant/guard';
import { enforceLimit } from '../../billing/enforce';
import type { DocumentFormat, DocumentType } from '../../documents/types';

export type CreateDocumentInput = {
  type: DocumentType;
  title: string;
  format: DocumentFormat;
  sourceContent: string;
  conversationId?: string | null;
};

/**
 * Folio institucional, secuencial por tenant y por año: `AIN-2026-000042`.
 *
 * Se cuenta lo emitido en el año en curso y se toma el siguiente. Dos
 * documentos creados en el mismo instante podrían pedir el mismo número, así
 * que existe un índice único `(tenant_id, folio)` y quien llama reintenta.
 * Preferimos un folio de verdad correlativo, que es lo que espera cualquiera
 * que reciba el documento, antes que un identificador aleatorio.
 */
async function nextFolio(ctx: TenantContext, attempt: number): Promise<string> {
  const year = new Date().getFullYear();
  const startOfYear = new Date(Date.UTC(year, 0, 1));

  const [row] = await db
    .select({ total: count() })
    .from(documents)
    .where(
      and(
        eq(documents.tenantId, ctx.tenantId),
        gte(documents.createdAt, startOfYear),
      ),
    );

  const sequence = (row?.total ?? 0) + 1 + attempt;
  return `AIN-${year}-${String(sequence).padStart(6, '0')}`;
}

/**
 * Crea el documento en estado `pending` junto con su primer trabajo.
 * La generación real ocurre después, en diferido (regla 3.3).
 */
export async function createDocument(
  ctx: TenantContext,
  input: CreateDocumentInput,
): Promise<{ document: DocumentRow; job: DocumentJobRow }> {
  assertTenantContext(ctx, 'createDocument');

  const title = input.title.trim().slice(0, 200);
  if (title.length === 0) {
    throw new Error('El documento necesita un título.');
  }

  const content = input.sourceContent.trim();
  if (content.length === 0) {
    throw new Error('El documento necesita contenido.');
  }

  /*
   * El límite de plan se comprueba aquí y no en cada sitio que genera un
   * documento —la tool, la exportación de educación, el plan posterior de
   * crisis— porque todos pasan por esta función y ninguno debe poder saltárselo
   * por olvido. El mensaje ya viene redactado para la persona.
   */
  const quota = await enforceLimit(ctx, 'documentos');
  if (!quota.allowed) throw new Error(quota.message);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const folio = await nextFolio(ctx, attempt);

    const [document] = await db
      .insert(documents)
      .values({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        conversationId: input.conversationId ?? null,
        type: input.type,
        title,
        format: input.format,
        sourceContent: content,
        folio,
      })
      .onConflictDoNothing()
      .returning();

    if (!document) continue; // folio ocupado: se reintenta con el siguiente

    const [job] = await db
      .insert(documentJobs)
      .values({ tenantId: ctx.tenantId, documentId: document.id })
      .returning();

    if (!job) {
      throw new Error('No se pudo registrar la generación del documento.');
    }

    return { document, job };
  }

  throw new Error('No se pudo asignar folio al documento.');
}

export async function getDocument(
  ctx: TenantContext,
  documentId: string,
): Promise<DocumentRow | null> {
  assertTenantContext(ctx, 'getDocument');

  const [row] = await db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.id, documentId),
        eq(documents.tenantId, ctx.tenantId),
        eq(documents.userId, ctx.userId),
      ),
    )
    .limit(1);

  return row ?? null;
}

export async function listDocuments(
  ctx: TenantContext,
  limit = 100,
): Promise<DocumentRow[]> {
  assertTenantContext(ctx, 'listDocuments');

  return db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.tenantId, ctx.tenantId),
        eq(documents.userId, ctx.userId),
      ),
    )
    .orderBy(desc(documents.createdAt))
    .limit(Math.min(Math.max(limit, 1), 200));
}

export type CompleteDocumentInput = {
  blobUrl: string;
  blobPathname: string;
  sizeBytes: number;
};

export async function markDocumentReady(
  ctx: TenantContext,
  documentId: string,
  input: CompleteDocumentInput,
): Promise<void> {
  assertTenantContext(ctx, 'markDocumentReady');

  await db
    .update(documents)
    .set({
      status: 'ready',
      blobUrl: input.blobUrl,
      blobPathname: input.blobPathname,
      sizeBytes: input.sizeBytes,
      updatedAt: new Date(),
    })
    .where(
      and(eq(documents.id, documentId), eq(documents.tenantId, ctx.tenantId)),
    );

  await db
    .update(documentJobs)
    .set({ status: 'ready', completedAt: new Date(), error: null })
    .where(
      and(
        eq(documentJobs.documentId, documentId),
        eq(documentJobs.tenantId, ctx.tenantId),
        eq(documentJobs.status, 'pending'),
      ),
    );
}

export async function markDocumentFailed(
  ctx: TenantContext,
  documentId: string,
  error: string,
): Promise<void> {
  assertTenantContext(ctx, 'markDocumentFailed');

  await db
    .update(documents)
    .set({ status: 'failed', updatedAt: new Date() })
    .where(
      and(eq(documents.id, documentId), eq(documents.tenantId, ctx.tenantId)),
    );

  await db
    .update(documentJobs)
    .set({
      status: 'failed',
      completedAt: new Date(),
      error: error.slice(0, 1000),
    })
    .where(
      and(
        eq(documentJobs.documentId, documentId),
        eq(documentJobs.tenantId, ctx.tenantId),
        eq(documentJobs.status, 'pending'),
      ),
    );
}

export async function renameDocument(
  ctx: TenantContext,
  documentId: string,
  title: string,
): Promise<DocumentRow> {
  assertTenantContext(ctx, 'renameDocument');

  const trimmed = title.trim().slice(0, 200);
  if (trimmed.length === 0) {
    throw new Error('El título no puede quedar vacío.');
  }

  const [row] = await db
    .update(documents)
    .set({ title: trimmed, updatedAt: new Date() })
    .where(
      and(
        eq(documents.id, documentId),
        eq(documents.tenantId, ctx.tenantId),
        eq(documents.userId, ctx.userId),
      ),
    )
    .returning();

  if (!row) {
    throw new Error('No se encontró el documento.');
  }

  return row;
}

export async function deleteDocument(
  ctx: TenantContext,
  documentId: string,
): Promise<DocumentRow | null> {
  assertTenantContext(ctx, 'deleteDocument');

  // Se devuelve la fila para que quien llama pueda borrar también el archivo.
  const [row] = await db
    .delete(documents)
    .where(
      and(
        eq(documents.id, documentId),
        eq(documents.tenantId, ctx.tenantId),
        eq(documents.userId, ctx.userId),
      ),
    )
    .returning();

  return row ?? null;
}

/**
 * Prepara una regeneración: el documento vuelve a `pending` y se abre un
 * trabajo nuevo. **El original no se toca hasta que la nueva versión está
 * lista**, porque perder un documento por una instrucción mal entendida sería
 * el peor resultado posible.
 */
export async function startRegeneration(
  ctx: TenantContext,
  documentId: string,
  revisionNote: string | null,
): Promise<{ document: DocumentRow; job: DocumentJobRow }> {
  assertTenantContext(ctx, 'startRegeneration');

  const document = await getDocument(ctx, documentId);
  if (!document) {
    throw new Error('No se encontró el documento.');
  }

  const [job] = await db
    .insert(documentJobs)
    .values({ tenantId: ctx.tenantId, documentId: document.id })
    .returning();

  if (!job) {
    throw new Error('No se pudo registrar la regeneración.');
  }

  const [updated] = await db
    .update(documents)
    .set({
      revisionNote: revisionNote?.trim().slice(0, 2000) ?? null,
      updatedAt: new Date(),
    })
    .where(
      and(eq(documents.id, document.id), eq(documents.tenantId, ctx.tenantId)),
    )
    .returning();

  return { document: updated ?? document, job };
}

export async function listDocumentJobs(
  ctx: TenantContext,
  documentId: string,
): Promise<DocumentJobRow[]> {
  assertTenantContext(ctx, 'listDocumentJobs');

  return db
    .select()
    .from(documentJobs)
    .where(
      and(
        eq(documentJobs.tenantId, ctx.tenantId),
        eq(documentJobs.documentId, documentId),
      ),
    )
    .orderBy(desc(documentJobs.createdAt));
}
