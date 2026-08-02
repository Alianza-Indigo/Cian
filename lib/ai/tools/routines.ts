import { tool } from 'ai';
import { z } from 'zod';
import {
  createRoutine,
  getRoutine,
  listRoutines,
  logRoutineCompletion,
  reorderRoutineSteps,
  updateRoutine,
} from '../../db/repositories/routines';
import {
  ROUTINE_TYPES,
  ROUTINE_TYPE_HINTS,
  ROUTINE_TYPE_LABELS,
  formatDuration,
} from '../../plans/types';
import type { ToolContext, ToolRegistry } from './index';

const typeCatalog = ROUTINE_TYPES.map(
  (type) => `- ${type} (${ROUTINE_TYPE_LABELS[type]}): ${ROUTINE_TYPE_HINTS[type]}`,
).join('\n');

/**
 * Tools de rutinas.
 *
 * Las duraciones se piden en minutos porque es como habla la gente; el
 * repositorio guarda segundos. Pedirle segundos al modelo produce números
 * absurdos con una facilidad que no compensa.
 */
export function buildRoutineTools({
  ctx,
  conversationId,
}: ToolContext): ToolRegistry {
  return {
    createRoutine: tool({
      description:
        'Crea una rutina: una secuencia ordenada de pasos concretos. Úsala ' +
        'cuando la persona pida una rutina o describa una parte del día que ' +
        'quiere organizar.\n\n' +
        'Los pasos deben ser observables y de un solo verbo («ponerse los ' +
        'zapatos», no «alistarse»). Ajusta la cantidad y la duración a la ' +
        'edad y a lo que la persona te haya contado: para alguien que se ' +
        'distrae, pasos más cortos y menos por rutina.\n\n' +
        `Tipos disponibles:\n${typeCatalog}`,
      inputSchema: z.object({
        type: z.enum(ROUTINE_TYPES),
        title: z.string().min(1).max(200),
        description: z.string().max(1000).optional(),
        steps: z
          .array(
            z.object({
              title: z
                .string()
                .min(1)
                .max(300)
                .describe('La acción concreta, empezando por un verbo.'),
              durationMinutes: z
                .number()
                .min(0)
                .max(60)
                .describe('Estimación en minutos. Es una guía, no un cronómetro.')
                .optional(),
              icon: z
                .string()
                .max(4)
                .describe('Un emoji que represente el paso, opcional.')
                .optional(),
              note: z
                .string()
                .max(500)
                .describe('Una ayuda breve para ese paso, si hace falta.')
                .optional(),
            }),
          )
          .min(1)
          .max(20)
          .describe('Los pasos en el orden en que ocurren.'),
      }),
      async execute({ type, title, description, steps }) {
        const routine = await createRoutine(ctx, {
          type,
          title,
          description,
          conversationId,
          steps: steps.map((step) => ({
            title: step.title,
            durationSeconds:
              step.durationMinutes === undefined
                ? null
                : Math.round(step.durationMinutes * 60),
            icon: step.icon ?? null,
            note: step.note ?? null,
          })),
        });

        const total = routine.steps.reduce(
          (sum, step) => sum + (step.durationSeconds ?? 0),
          0,
        );

        return {
          routineId: routine.id,
          titulo: routine.title,
          tipo: ROUTINE_TYPE_LABELS[routine.type],
          pasos: routine.steps.length,
          duracionTotal: formatDuration(total),
          aviso:
            'La rutina ya está guardada. La persona puede recorrerla paso a ' +
            'paso desde la sección de rutinas. No repitas todos los pasos en ' +
            'tu respuesta.',
        };
      },
    }),

    listRoutines: tool({
      description: 'Lista las rutinas de la persona.',
      inputSchema: z.object({}),
      async execute() {
        const rows = await listRoutines(ctx, 50);
        return {
          total: rows.length,
          rutinas: rows.map((routine) => ({
            routineId: routine.id,
            titulo: routine.title,
            tipo: ROUTINE_TYPE_LABELS[routine.type],
            activa: routine.active,
          })),
        };
      },
    }),

    getRoutine: tool({
      description: 'Trae una rutina completa con sus pasos en orden.',
      inputSchema: z.object({ routineId: z.uuid() }),
      async execute({ routineId }) {
        const routine = await getRoutine(ctx, routineId);
        if (!routine) return { encontrada: false };

        return {
          encontrada: true,
          titulo: routine.title,
          tipo: ROUTINE_TYPE_LABELS[routine.type],
          pasos: routine.steps.map((step) => ({
            pasoId: step.id,
            titulo: step.title,
            duracion: formatDuration(step.durationSeconds),
            nota: step.note,
          })),
        };
      },
    }),

    updateRoutine: tool({
      description: 'Cambia el título, la descripción o si la rutina está activa.',
      inputSchema: z.object({
        routineId: z.uuid(),
        title: z.string().min(1).max(200).optional(),
        description: z.string().max(1000).optional(),
        active: z.boolean().optional(),
      }),
      async execute({ routineId, title, description, active }) {
        const routine = await updateRoutine(ctx, routineId, {
          title,
          description,
          active,
        });
        return { routineId: routine.id, titulo: routine.title, actualizada: true };
      },
    }),

    reorderRoutineSteps: tool({
      description:
        'Cambia el orden de los pasos. Recibe todos los identificadores en el ' +
        'orden nuevo. Úsalo cuando la persona diga que algo va antes o después.',
      inputSchema: z.object({
        routineId: z.uuid(),
        orderedStepIds: z
          .array(z.uuid())
          .min(1)
          .describe('Todos los pasos, en el orden en que deben quedar.'),
      }),
      async execute({ routineId, orderedStepIds }) {
        const steps = await reorderRoutineSteps(ctx, routineId, orderedStepIds);
        return {
          reordenada: true,
          pasos: steps.map((step, index) => `${index + 1}. ${step.title}`),
        };
      },
    }),

    logRoutineCompletion: tool({
      description:
        'Registra que la rutina se hizo, y qué pasos se completaron. Úsalo ' +
        'cuando la persona cuente cómo le fue con una rutina.',
      inputSchema: z.object({
        routineId: z.uuid(),
        completedStepIds: z.array(z.uuid()).default([]),
        note: z.string().max(1000).optional(),
      }),
      async execute({ routineId, completedStepIds, note }) {
        await logRoutineCompletion(ctx, routineId, { completedStepIds, note });
        return { registrado: true };
      },
    }),
  };
}
