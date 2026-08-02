import { tool } from 'ai';
import { z } from 'zod';
import {
  completeTask,
  createTask,
  getTask,
  listTasks,
  prioritizeTasks,
  replaceSubtasks,
} from '../../db/repositories/tasks';
import {
  MAX_SUBTASKS,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
} from '../../sensory/types';
import type { ToolContext, ToolRegistry } from './index';

/**
 * Tools de funciones ejecutivas.
 *
 * El criterio de aceptación marca el tono de todo este módulo: ante «no puedo
 * empezar a limpiar» hay que devolver **un primer paso mínimo, no una lista de
 * diez cosas**. Por eso `breakDownTask` pide explícitamente el primer paso
 * aparte y acota las subtareas.
 */
export function buildTaskTools({ ctx }: ToolContext): ToolRegistry {
  return {
    createTask: tool({
      description:
        'Guarda una tarea que la persona necesita hacer. Si además cuesta ' +
        'empezarla, usa después breakDownTask.',
      inputSchema: z.object({
        title: z.string().min(1).max(300),
        notes: z.string().max(2000).optional(),
        priority: z.enum(TASK_PRIORITIES).default('media'),
        estimatedMinutes: z.number().int().min(1).max(600).optional(),
      }),
      async execute({ title, notes, priority, estimatedMinutes }) {
        const task = await createTask(ctx, {
          title,
          notes,
          priority,
          estimatedMinutes,
        });
        return { taskId: task.id, titulo: task.title, guardada: true };
      },
    }),

    breakDownTask: tool({
      description:
        'Descompone una tarea en pasos accionables y señala cuál es el ' +
        'primero. Úsalo cuando alguien diga que no puede empezar algo.\n\n' +
        'Reglas de la descomposición:\n' +
        `- Como máximo ${MAX_SUBTASKS} pasos. Ante la parálisis, una lista larga es más parálisis.\n` +
        '- El primer paso debe ser mínimo y físico: algo que se hace en un par ' +
        'de minutos sin decidir nada («llevar un vaso al fregadero», no ' +
        '«ordenar la cocina»).\n' +
        '- Cada paso empieza con un verbo y describe una sola acción.',
      inputSchema: z.object({
        taskId: z.uuid(),
        firstStep: z
          .string()
          .min(1)
          .max(300)
          .describe(
            'El primer paso mínimo. Tan pequeño que cueste decir que no.',
          ),
        remainingSteps: z
          .array(
            z.object({
              title: z.string().min(1).max(300),
              estimatedMinutes: z.number().int().min(1).max(120).optional(),
            }),
          )
          .max(MAX_SUBTASKS - 1)
          .describe('Los pasos que siguen, si los hay.')
          .default([]),
      }),
      async execute({ taskId, firstStep, remainingSteps }) {
        const subtasks = await replaceSubtasks(ctx, taskId, [
          { title: firstStep, estimatedMinutes: 2 },
          ...remainingSteps,
        ]);

        return {
          descompuesta: true,
          primerPaso: subtasks[0]?.title ?? firstStep,
          totalPasos: subtasks.length,
          aviso:
            'Menciona solo el primer paso en tu respuesta. Los demás están ' +
            'guardados y la persona los verá cuando los necesite.',
        };
      },
    }),

    listTasks: tool({
      description: 'Lista las tareas de la persona, con sus subtareas.',
      inputSchema: z.object({
        status: z.enum(TASK_STATUSES).optional(),
      }),
      async execute({ status }) {
        const rows = await listTasks(ctx, { status });

        return {
          total: rows.length,
          tareas: rows.map((task) => ({
            taskId: task.id,
            titulo: task.title,
            estado: TASK_STATUS_LABELS[task.status],
            prioridad: TASK_PRIORITY_LABELS[task.priority],
            pasos: task.subtasks.map((subtask) => ({
              pasoId: subtask.id,
              titulo: subtask.title,
              estado: TASK_STATUS_LABELS[subtask.status],
            })),
          })),
        };
      },
    }),

    prioritizeTasks: tool({
      description:
        'Ordena las tareas pendientes. Recibe los identificadores en el orden ' +
        'en que conviene atenderlas. Úsalo cuando la persona no sepa por dónde ' +
        'empezar entre varias cosas.',
      inputSchema: z.object({
        orderedTaskIds: z.array(z.uuid()).min(1),
      }),
      async execute({ orderedTaskIds }) {
        await prioritizeTasks(ctx, orderedTaskIds);
        return { ordenadas: true, total: orderedTaskIds.length };
      },
    }),

    completeTask: tool({
      description: 'Marca una tarea o un paso como hecho.',
      inputSchema: z.object({ taskId: z.uuid() }),
      async execute({ taskId }) {
        const task = await completeTask(ctx, taskId);
        return { completada: true, titulo: task.title };
      },
    }),

    getTask: tool({
      description: 'Trae una tarea con sus pasos.',
      inputSchema: z.object({ taskId: z.uuid() }),
      async execute({ taskId }) {
        const task = await getTask(ctx, taskId);
        if (!task) return { encontrada: false };

        return {
          encontrada: true,
          titulo: task.title,
          estado: TASK_STATUS_LABELS[task.status],
          pasos: task.subtasks.map((subtask) => ({
            pasoId: subtask.id,
            titulo: subtask.title,
            estado: TASK_STATUS_LABELS[subtask.status],
          })),
        };
      },
    }),
  };
}
