import { tool } from 'ai';
import { z } from 'zod';
import {
  listMemories,
  saveMemory,
  searchMemories,
} from '../../db/repositories/memories';
import type { ToolContext, ToolRegistry } from './index';

/**
 * Tools de memoria.
 *
 * Lo que CIAN recuerda de una persona es suyo: puede verlo, corregirlo y
 * borrarlo desde su propia pantalla. Estas tools solo escriben y leen; el
 * control queda en `/memorias`.
 */
export function buildMemoryTools({ ctx, sourceMessageId }: ToolContext): ToolRegistry {
  return {
    saveMemory: tool({
      description:
        'Guarda un dato que la persona quiere que recuerdes entre conversaciones: ' +
        'preferencias, sensibilidades, nombres, rutinas o cualquier cosa que pida ' +
        'recordar explícitamente. Úsalo cuando diga algo como «recuerda que...». ' +
        'No lo uses para datos de una sola conversación ni para información médica ' +
        'que la persona no haya pedido guardar.',
      inputSchema: z.object({
        key: z
          .string()
          .min(1)
          .max(80)
          .describe(
            'Identificador corto y estable del dato, en minúsculas. ' +
              'Ejemplos: ruidos_fuertes, nombre_hijo, rutina_matutina.',
          ),
        value: z
          .string()
          .min(1)
          .max(2000)
          .describe('El dato tal como debe recordarse, en una o dos frases.'),
      }),
      async execute({ key, value }) {
        const row = await saveMemory(ctx, {
          key,
          value,
          sourceMessageId,
          // Llega por petición explícita de la persona en la conversación.
          confirmedByUser: true,
        });

        return {
          guardado: true,
          clave: row.key,
          aviso:
            'La persona puede ver, editar o borrar esto desde la pantalla de memorias.',
        };
      },
    }),

    searchMemory: tool({
      description:
        'Busca en lo que ya recuerdas de esta persona. Úsalo antes de preguntar ' +
        'algo que quizá ya te contó, y cuando la respuesta dependa de sus ' +
        'preferencias o de su historia.',
      inputSchema: z.object({
        query: z
          .string()
          .max(200)
          .describe(
            'Qué buscar. Déjalo vacío para traer todo lo recordado más reciente.',
          )
          .optional(),
      }),
      async execute({ query }) {
        const rows = query?.trim()
          ? await searchMemories(ctx, query, 20)
          : await listMemories(ctx, 20);

        return {
          total: rows.length,
          memorias: rows.map((row) => ({
            clave: row.key,
            contenido: row.value,
            confirmadaPorLaPersona: row.confirmedByUser,
            actualizada: row.updatedAt.toISOString(),
          })),
        };
      },
    }),
  };
}
