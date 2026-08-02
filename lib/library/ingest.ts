/**
 * Lectura y troceado del contenido de la biblioteca.
 *
 * Los recursos son archivos Markdown en `content/library/` con frontmatter.
 * Aquí se leen, se validan y se parten en fragmentos que quepan en un
 * embedding sin perder el hilo.
 *
 * El intérprete de frontmatter está escrito a mano: son cinco campos de texto
 * y no justifica una dependencia. Si algún día el frontmatter se complica,
 * conviene proponer `gray-matter` antes que estirar esto.
 */
import { createHash } from 'node:crypto';
import {
  LIBRARY_CATEGORIES,
  type LibraryCategory,
} from './types';

export type ResourceFrontmatter = {
  title: string;
  category: LibraryCategory;
  tags: string[];
  source: string | null;
  reviewedAt: Date | null;
};

export type ParsedResource = ResourceFrontmatter & {
  slug: string;
  content: string;
  contentHash: string;
};

export class LibraryIngestError extends Error {
  override readonly name = 'LibraryIngestError';
}

/** `clave: valor` por línea, entre dos líneas de `---`. */
function parseFrontmatter(raw: string): {
  fields: Record<string, string>;
  body: string;
} {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw.trim());

  if (!match?.[1]) {
    throw new LibraryIngestError(
      'El recurso no tiene frontmatter. Debe empezar con --- y declarar al menos título y categoría.',
    );
  }

  const fields: Record<string, string> = {};

  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf(':');
    if (separator === -1) continue;

    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line
      .slice(separator + 1)
      .trim()
      .replace(/^["']|["']$/g, '');

    if (key.length > 0) fields[key] = value;
  }

  return { fields, body: (match[2] ?? '').trim() };
}

export function parseResource(slug: string, raw: string): ParsedResource {
  const { fields, body } = parseFrontmatter(raw);

  const title = fields.titulo ?? fields.title ?? '';
  if (title.length === 0) {
    throw new LibraryIngestError(`El recurso "${slug}" no declara título.`);
  }

  const rawCategory = (fields.categoria ?? fields.category ?? '').toLowerCase();
  const category = LIBRARY_CATEGORIES.find((item) => item === rawCategory);
  if (!category) {
    throw new LibraryIngestError(
      `El recurso "${slug}" declara la categoría "${rawCategory}", que no existe. ` +
        `Categorías válidas: ${LIBRARY_CATEGORIES.join(', ')}.`,
    );
  }

  if (body.length === 0) {
    throw new LibraryIngestError(`El recurso "${slug}" no tiene contenido.`);
  }

  const rawTags = fields.etiquetas ?? fields.tags ?? '';
  const tags = rawTags
    .split(',')
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag) => tag.length > 0);

  const rawReviewed = fields.revisado ?? fields.reviewed_at ?? '';
  const reviewedAt =
    rawReviewed.length > 0 && !Number.isNaN(Date.parse(rawReviewed))
      ? new Date(rawReviewed)
      : null;

  return {
    slug,
    title,
    category,
    tags,
    source: fields.fuente ?? fields.source ?? null,
    reviewedAt,
    content: body,
    contentHash: createHash('sha256').update(body).digest('hex'),
  };
}

/** Tamaños en caracteres. Un fragmento demasiado corto pierde el contexto. */
const TARGET_CHUNK_CHARS = 1400;
const MIN_CHUNK_CHARS = 300;

/**
 * Parte el contenido por encabezados y, dentro de cada sección, por párrafos.
 *
 * Se corta por límites naturales del texto y no cada N caracteres: un
 * fragmento que empieza a media frase recupera peor, y al citarlo se lee mal.
 * Cada fragmento arrastra el encabezado de su sección, para que conserve el
 * contexto aunque se recupere suelto.
 */
export function chunkContent(content: string): string[] {
  const lines = content.replace(/\r\n/g, '\n').split('\n');

  const sections: Array<{ heading: string | null; body: string[] }> = [];
  let current: { heading: string | null; body: string[] } = {
    heading: null,
    body: [],
  };

  for (const line of lines) {
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading?.[2]) {
      if (current.body.join('').trim().length > 0 || current.heading) {
        sections.push(current);
      }
      current = { heading: heading[2].trim(), body: [] };
      continue;
    }
    current.body.push(line);
  }
  sections.push(current);

  const chunks: string[] = [];

  for (const section of sections) {
    const paragraphs = section.body
      .join('\n')
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.trim())
      .filter((paragraph) => paragraph.length > 0);

    if (paragraphs.length === 0) continue;

    const prefix = section.heading ? `${section.heading}\n\n` : '';
    let buffer = '';

    for (const paragraph of paragraphs) {
      const candidate = buffer.length === 0 ? paragraph : `${buffer}\n\n${paragraph}`;

      if (prefix.length + candidate.length <= TARGET_CHUNK_CHARS) {
        buffer = candidate;
        continue;
      }

      if (buffer.length > 0) chunks.push(prefix + buffer);
      buffer = paragraph;
    }

    if (buffer.length > 0) chunks.push(prefix + buffer);
  }

  // Fragmentos muy cortos se pegan al anterior: solos no recuperan nada útil.
  const merged: string[] = [];
  for (const chunk of chunks) {
    const previous = merged[merged.length - 1];
    if (chunk.length < MIN_CHUNK_CHARS && previous !== undefined) {
      merged[merged.length - 1] = `${previous}\n\n${chunk}`;
    } else {
      merged.push(chunk);
    }
  }

  return merged.length > 0 ? merged : [content.trim()];
}
