/**
 * Indexado de la biblioteca desde `content/library/`.
 *
 * Lo dispara el cron de Vercel o el comando administrativo. Es seguro de
 * repetir: un recurso cuyo contenido no cambió se salta, y con él el costo de
 * sus embeddings.
 *
 * **Criterio de aceptación: reindexar no rompe consultas en curso.** El
 * reemplazo ocurre recurso por recurso y dentro de una transacción, así que
 * mientras uno se reescribe los demás siguen consultables y ese uno pasa de su
 * versión anterior a la nueva sin quedar vacío en medio.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { chunkContent, parseResource, LibraryIngestError } from './ingest';
import { embedForIndexing } from './embeddings';
import {
  deleteGlobalResourcesNotIn,
  upsertResourceWithChunks,
} from '../db/repositories/library';

export type IndexReport = {
  total: number;
  indexed: number;
  skipped: number;
  removed: number;
  withoutEmbeddings: number;
  errors: Array<{ slug: string; error: string }>;
};

export const LIBRARY_CONTENT_DIR = join(process.cwd(), 'content', 'library');

export async function indexLibrary(
  contentDir = LIBRARY_CONTENT_DIR,
): Promise<IndexReport> {
  const report: IndexReport = {
    total: 0,
    indexed: 0,
    skipped: 0,
    removed: 0,
    withoutEmbeddings: 0,
    errors: [],
  };

  let files: string[];
  try {
    files = readdirSync(contentDir).filter((file) => file.endsWith('.md'));
  } catch {
    return report;
  }

  const slugs: string[] = [];

  for (const file of files) {
    const slug = file.replace(/\.md$/, '');
    slugs.push(slug);
    report.total += 1;

    try {
      const raw = readFileSync(join(contentDir, file), 'utf8');
      const resource = parseResource(slug, raw);
      const chunks = chunkContent(resource.content);

      // Los embeddings se piden solo si el recurso va a reindexarse; el
      // repositorio decide por huella y devuelve `indexed: false` si no cambió.
      const embeddings = await embedForIndexing(chunks);

      if (!embeddings) report.withoutEmbeddings += 1;

      const result = await upsertResourceWithChunks(
        resource,
        chunks.map((content, index) => ({
          content,
          embedding: embeddings?.[index] ?? null,
        })),
      );

      if (result.indexed) report.indexed += 1;
      else report.skipped += 1;
    } catch (error) {
      const message =
        error instanceof LibraryIngestError || error instanceof Error
          ? error.message
          : String(error);

      report.errors.push({ slug, error: message });
      console.error(`[biblioteca] error al indexar "${slug}" —`, message);
    }
  }

  // Un recurso borrado del repositorio deja de existir en la biblioteca.
  try {
    report.removed = await deleteGlobalResourcesNotIn(slugs);
  } catch {
    // Que no se limpie no invalida el resto del indexado.
  }

  return report;
}
