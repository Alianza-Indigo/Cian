import { tool } from 'ai';
import { waitUntil } from '@vercel/functions';
import { z } from 'zod';
import { createDocument } from '../../db/repositories/documents';
import { runDocumentGeneration } from '../../documents/generate';
import {
  DOCUMENT_FORMATS,
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_HINTS,
  DOCUMENT_TYPE_LABELS,
} from '../../documents/types';
import type { ToolContext, ToolRegistry } from './index';

/**
 * `createDocument` — convierte lo hablado en un documento descargable.
 *
 * La tool **no espera** a que el documento esté hecho: crea la fila, despacha
 * la generación con `waitUntil` y devuelve de inmediato (regla 3.3). El chat
 * sigue fluido y la interfaz avisa cuando el archivo está listo.
 */
const typeCatalog = DOCUMENT_TYPES.map(
  (type) => `- ${type} (${DOCUMENT_TYPE_LABELS[type]}): ${DOCUMENT_TYPE_HINTS[type]}`,
).join('\n');

export function buildDocumentTools({
  ctx,
  conversationId,
}: ToolContext): ToolRegistry {
  return {
    createDocument: tool({
      description:
        'Convierte contenido en un documento descargable con la plantilla de ' +
        'Alianza Índigo. Úsalo cuando la persona pida un documento, una carta, ' +
        'un informe, una lista para imprimir o diga algo como «conviértelo en ' +
        'una carta». Escribe tú el contenido completo y bien redactado: no ' +
        'resumas ni dejes huecos para que los llene después.\n\n' +
        `Tipos disponibles:\n${typeCatalog}`,
      inputSchema: z.object({
        type: z
          .enum(DOCUMENT_TYPES)
          .describe('El tipo que mejor corresponda a lo que se pidió.'),
        title: z
          .string()
          .min(1)
          .max(200)
          .describe('Título del documento, claro y sin comillas.'),
        content: z
          .string()
          .min(1)
          .describe(
            'El contenido completo en Markdown sencillo: # para títulos, ' +
              '- para viñetas, 1. para listas numeradas, - [ ] para casillas. ' +
              'Escríbelo en español de México y listo para entregarse.',
          ),
        format: z
          .enum(DOCUMENT_FORMATS)
          .describe(
            'pdf para entregar o imprimir, docx si lo van a editar, ' +
              'md o txt si solo quieren el texto. Ante la duda, pdf.',
          )
          .default('pdf'),
      }),
      async execute({ type, title, content, format }) {
        const { document } = await createDocument(ctx, {
          type,
          title,
          format,
          sourceContent: content,
          conversationId,
        });

        // La generación ocurre después de que esta respuesta ya salió.
        waitUntil(runDocumentGeneration(ctx, document.id));

        return {
          documentId: document.id,
          titulo: document.title,
          tipo: DOCUMENT_TYPE_LABELS[document.type],
          formato: document.format,
          folio: document.folio,
          estado: 'en_preparacion',
          aviso:
            'El documento se está preparando y aparecerá listo para descargar ' +
            'en unos segundos. No repitas su contenido en tu respuesta: basta ' +
            'con decir qué documento creaste.',
        };
      },
    }),
  };
}
