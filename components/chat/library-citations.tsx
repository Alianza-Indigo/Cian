'use client';

import type { UIMessage } from 'ai';
import Link from 'next/link';
import { BookOpen } from 'lucide-react';

/**
 * Citas de la biblioteca bajo una respuesta.
 *
 * Criterio de aceptación: «toda respuesta que use la biblioteca cita el
 * recurso de forma visible en la UI».
 *
 * Las citas se leen de la salida de `searchLibrary`, no del texto del modelo.
 * Eso importa: si dependieran de que el modelo las escriba, una respuesta
 * apoyada en la biblioteca podría quedarse sin fuente. Así la cita aparece
 * porque la búsqueda ocurrió, no porque el modelo se acordara.
 */
type Citation = { slug: string; title: string; categoria?: string };

function citationsOf(message: UIMessage): Citation[] {
  const found = new Map<string, Citation>();

  for (const part of message.parts) {
    if (part.type !== 'tool-searchLibrary') continue;

    const output = (part as { output?: unknown }).output;
    if (!output || typeof output !== 'object') continue;

    const results = (output as { resultados?: unknown }).resultados;
    if (!Array.isArray(results)) continue;

    for (const result of results) {
      if (!result || typeof result !== 'object') continue;
      const candidate = result as {
        slug?: unknown;
        titulo?: unknown;
        categoria?: unknown;
      };

      if (typeof candidate.slug !== 'string' || typeof candidate.titulo !== 'string') {
        continue;
      }

      // Varios fragmentos del mismo recurso son una sola cita.
      if (!found.has(candidate.slug)) {
        found.set(candidate.slug, {
          slug: candidate.slug,
          title: candidate.titulo,
          ...(typeof candidate.categoria === 'string'
            ? { categoria: candidate.categoria }
            : {}),
        });
      }
    }
  }

  return [...found.values()];
}

export function LibraryCitations({ message }: { message: UIMessage }) {
  const citations = citationsOf(message);
  if (citations.length === 0) return null;

  return (
    <div className="mt-3 border-t border-border pt-2">
      <p className="text-xs font-medium text-muted-foreground">
        {citations.length === 1 ? 'Fuente' : 'Fuentes'}
      </p>
      <ul className="mt-1.5 space-y-1">
        {citations.map((citation) => (
          <li key={citation.slug}>
            <Link
              href={`/biblioteca/${citation.slug}`}
              className="inline-flex items-start gap-1.5 text-xs text-foreground underline decoration-muted-foreground underline-offset-2 hover:decoration-foreground"
            >
              <BookOpen aria-hidden="true" className="mt-0.5 size-3 shrink-0" />
              <span>
                {citation.title}
                {citation.categoria ? (
                  <span className="text-muted-foreground">
                    {' '}
                    · {citation.categoria}
                  </span>
                ) : null}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
