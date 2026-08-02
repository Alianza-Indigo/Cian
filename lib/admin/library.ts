/**
 * Biblioteca desde el panel. Fase 9.
 *
 * ## Por qué existe
 *
 * Hasta la Fase 6 los recursos de la biblioteca vivían en `content/library/`
 * como archivos Markdown del repositorio, y publicar uno exigía un commit y un
 * despliegue. Eso es razonable para el contenido de arranque y no lo es para
 * operar: quien cura contenido en Alianza Índigo no tiene por qué tocar el
 * repositorio.
 *
 * El PRD lo pide en el alcance de esta fase —«recursos y biblioteca: cargar,
 * editar, revisar, publicar»— y aquí está.
 *
 * ## Conviven las dos vías
 *
 * Los archivos del repositorio se siguen indexando en cada despliegue con
 * `indexLibrary()`. Ambas escriben en la misma tabla y por el mismo `slug`, así
 * que **un recurso creado en el panel con el slug de un archivo del repositorio
 * lo sobrescribe, y el siguiente despliegue lo revierte**. Es la trampa obvia y
 * está anotada en NOTES.md; la interfaz avisa de qué recursos vienen de
 * archivo.
 */
import { createHash } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db/client';
import { libraryResources } from '../db/schema/library';
import { chunkContent } from '../library/ingest';
import { embedForIndexing } from '../library/embeddings';
import { upsertResourceWithChunks } from '../db/repositories/library';
import type { LibraryCategory } from '../library/types';

export type SaveResourceInput = {
  slug: string;
  title: string;
  category: LibraryCategory;
  tags: string[];
  source?: string;
  content: string;
};

export type SaveResourceResult = {
  indexed: boolean;
  chunks: number;
  withEmbeddings: boolean;
};

export async function saveLibraryResource(
  input: SaveResourceInput,
): Promise<SaveResourceResult> {
  const content = input.content.trim();
  const chunks = chunkContent(content);

  // Los embeddings pueden no estar disponibles —sin clave, o si el proveedor
  // falla—. El recurso se guarda igual y queda buscable por texto; la Fase 6
  // ya contempla esa degradación.
  const embeddings = await embedForIndexing(chunks);

  const result = await upsertResourceWithChunks(
    {
      // `null` = contenido global de CIAN, visible para todo el mundo.
      tenantId: null,
      slug: input.slug,
      title: input.title.trim(),
      category: input.category,
      tags: input.tags.map((tag) => tag.trim()).filter(Boolean),
      source: input.source?.trim() || null,
      reviewedAt: new Date(),
      content,
      contentHash: createHash('sha256').update(content).digest('hex'),
    },
    chunks.map((chunk, index) => ({
      content: chunk,
      embedding: embeddings?.[index] ?? null,
    })),
  );

  return {
    indexed: result.indexed,
    chunks: chunks.length,
    withEmbeddings: embeddings !== null,
  };
}

export async function removeLibraryResource(slug: string): Promise<void> {
  // Solo recursos globales: los de un tenant se administran desde su espacio.
  await db
    .delete(libraryResources)
    .where(
      and(eq(libraryResources.slug, slug), isNull(libraryResources.tenantId)),
    );
}

export type AdminResource = {
  id: string;
  slug: string;
  title: string;
  category: LibraryCategory;
  tags: string[];
  source: string | null;
  updatedAt: Date;
  content: string;
};

export async function listGlobalResources(): Promise<AdminResource[]> {
  const rows = await db
    .select()
    .from(libraryResources)
    .where(isNull(libraryResources.tenantId))
    .orderBy(libraryResources.title);

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    category: row.category,
    tags: row.tags,
    source: row.source,
    updatedAt: row.updatedAt,
    content: row.content,
  }));
}
