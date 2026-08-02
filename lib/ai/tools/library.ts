import { tool } from 'ai';
import { z } from 'zod';
import { searchLibrary } from '../../db/repositories/library';
import {
  LIBRARY_CATEGORIES,
  LIBRARY_CATEGORY_LABELS,
} from '../../library/types';
import type { ToolContext, ToolRegistry } from './index';

/**
 * `searchLibrary` — la base de conocimiento propia de CIAN.
 *
 * Está disponible para todos los agentes, y lo estará también para el de
 * crisis en la Fase 7.
 *
 * **Toda respuesta que se apoye en la biblioteca cita el recurso.** La tool
 * devuelve el `slug` y el título de cada fuente, y la interfaz los pinta como
 * citas con enlace bajo la respuesta. Que el modelo mencione la fuente en su
 * texto es deseable; que la interfaz la muestre no depende de él.
 */
export function buildLibraryTools({ ctx }: ToolContext): ToolRegistry {
  return {
    searchLibrary: tool({
      description:
        'Busca en la biblioteca de CIAN: contenido revisado sobre ' +
        'neurodivergencia, educación, comunicación, inclusión, derechos, ' +
        'accesibilidad, estrategias prácticas, vida diaria y recursos para ' +
        'familias.\n\n' +
        'Úsalo siempre que la pregunta admita una respuesta informada: es ' +
        'contenido revisado y vale más que lo que recuerdes por tu cuenta. ' +
        'Apóyate en lo que devuelva y menciona de dónde sale.',
      inputSchema: z.object({
        query: z
          .string()
          .min(2)
          .max(300)
          .describe('Qué se busca, en las palabras de la conversación.'),
        category: z
          .enum(LIBRARY_CATEGORIES)
          .describe('Acota la búsqueda si el tema es claramente de una sola área.')
          .optional(),
      }),
      async execute({ query, category }) {
        const results = await searchLibrary(ctx, query, { category, limit: 5 });

        return {
          total: results.length,
          resultados: results.map((result) => ({
            slug: result.slug,
            titulo: result.title,
            categoria: LIBRARY_CATEGORY_LABELS[result.category],
            fuente: result.source,
            fragmento: result.excerpt,
          })),
          aviso:
            results.length === 0
              ? 'La biblioteca no tiene nada sobre esto. Dilo con claridad en ' +
                'vez de inventar una fuente.'
              : 'Apóyate en estos fragmentos. La interfaz muestra las fuentes ' +
                'debajo de tu respuesta, así que no hace falta que las listes.',
        };
      },
    }),
  };
}
