import { tool } from 'ai';
import { z } from 'zod';
import {
  addPlanObjective,
  createPlan,
  getPlan,
  listPlans,
  logPlanProgress,
  updatePlan,
} from '../../db/repositories/plans';
import {
  OBJECTIVE_STATUS_LABELS,
  PLAN_STATUSES,
  PLAN_STATUS_LABELS,
  PLAN_TYPES,
  PLAN_TYPE_HINTS,
  PLAN_TYPE_LABELS,
} from '../../plans/types';
import type { ToolContext, ToolRegistry } from './index';

const typeCatalog = PLAN_TYPES.map(
  (type) => `- ${type} (${PLAN_TYPE_LABELS[type]}): ${PLAN_TYPE_HINTS[type]}`,
).join('\n');

/**
 * Tools de planes de apoyo.
 *
 * «Convierte esto en un plan» debe producir una estructura, no un texto: por
 * eso `createPlan` exige objetivos con sus estrategias en el esquema. Si el
 * modelo devolviera prosa, la validación de Zod lo obliga a reintentar.
 */
export function buildPlanTools({ ctx, conversationId }: ToolContext): ToolRegistry {
  return {
    createPlan: tool({
      description:
        'Crea un plan de apoyo estructurado a partir de lo conversado. Úsalo ' +
        'cuando la persona pida un plan o diga algo como «convierte esto en un ' +
        'plan». Un plan son objetivos concretos, y cada objetivo lleva ' +
        'estrategias accionables: nada de intenciones vagas.\n\n' +
        `Tipos disponibles:\n${typeCatalog}`,
      inputSchema: z.object({
        type: z.enum(PLAN_TYPES),
        title: z.string().min(1).max(200),
        description: z
          .string()
          .max(2000)
          .describe('Para qué es este plan y a quién acompaña.')
          .optional(),
        objectives: z
          .array(
            z.object({
              title: z
                .string()
                .min(1)
                .max(300)
                .describe('Qué se busca lograr, en una frase concreta.'),
              description: z.string().max(1000).optional(),
              strategies: z
                .array(z.string().min(1).max(1000))
                .describe(
                  'Acciones concretas para lograr el objetivo. Qué hacer, ' +
                    'cuándo y quién. Entre dos y cinco por objetivo.',
                )
                .default([]),
            }),
          )
          .min(1)
          .max(12)
          .describe('Los objetivos del plan, en orden de importancia.'),
      }),
      async execute({ type, title, description, objectives }) {
        const plan = await createPlan(ctx, {
          type,
          title,
          description,
          conversationId,
          objectives,
        });

        return {
          planId: plan.id,
          titulo: plan.title,
          tipo: PLAN_TYPE_LABELS[plan.type],
          objetivos: plan.objectives.length,
          aviso:
            'El plan ya está guardado y la persona puede verlo y editarlo en ' +
            'la sección de planes. No repitas el plan completo en tu respuesta.',
        };
      },
    }),

    listPlans: tool({
      description:
        'Lista los planes de apoyo de la persona. Úsalo antes de crear uno ' +
        'nuevo, por si ya existe uno al que convenga sumar el objetivo.',
      inputSchema: z.object({}),
      async execute() {
        const rows = await listPlans(ctx, 50);
        return {
          total: rows.length,
          planes: rows.map((plan) => ({
            planId: plan.id,
            titulo: plan.title,
            tipo: PLAN_TYPE_LABELS[plan.type],
            estado: PLAN_STATUS_LABELS[plan.status],
          })),
        };
      },
    }),

    getPlan: tool({
      description:
        'Trae un plan completo con sus objetivos y estrategias. Úsalo cuando ' +
        'la conversación se refiera a un plan que ya existe.',
      inputSchema: z.object({ planId: z.uuid() }),
      async execute({ planId }) {
        const plan = await getPlan(ctx, planId);
        if (!plan) return { encontrado: false };

        return {
          encontrado: true,
          titulo: plan.title,
          tipo: PLAN_TYPE_LABELS[plan.type],
          estado: PLAN_STATUS_LABELS[plan.status],
          descripcion: plan.description,
          objetivos: plan.objectives.map((objective) => ({
            objetivoId: objective.id,
            titulo: objective.title,
            estado: OBJECTIVE_STATUS_LABELS[objective.status],
            estrategias: objective.strategies.map((s) => s.content),
          })),
        };
      },
    }),

    updatePlan: tool({
      description:
        'Cambia el título, la descripción, el tipo o el estado de un plan.',
      inputSchema: z.object({
        planId: z.uuid(),
        title: z.string().min(1).max(200).optional(),
        description: z.string().max(2000).optional(),
        status: z.enum(PLAN_STATUSES).optional(),
      }),
      async execute({ planId, title, description, status }) {
        const plan = await updatePlan(ctx, planId, { title, description, status });
        return { planId: plan.id, titulo: plan.title, actualizado: true };
      },
    }),

    addPlanObjective: tool({
      description:
        'Agrega un objetivo con sus estrategias a un plan que ya existe.',
      inputSchema: z.object({
        planId: z.uuid(),
        title: z.string().min(1).max(300),
        description: z.string().max(1000).optional(),
        strategies: z.array(z.string().min(1).max(1000)).default([]),
      }),
      async execute({ planId, title, description, strategies }) {
        const objective = await addPlanObjective(ctx, planId, {
          title,
          description,
          strategies,
        });
        return { objetivoId: objective.id, titulo: objective.title, agregado: true };
      },
    }),

    logPlanProgress: tool({
      description:
        'Registra cómo va un plan: qué se intentó, qué funcionó y qué no. ' +
        'Úsalo cuando la persona cuente cómo le fue con lo acordado.',
      inputSchema: z.object({
        planId: z.uuid(),
        objectiveId: z
          .uuid()
          .describe('El objetivo concreto, si el avance es de uno solo.')
          .optional(),
        note: z.string().max(2000).describe('Qué pasó, en palabras llanas.'),
        rating: z
          .number()
          .int()
          .min(1)
          .max(5)
          .describe('Del 1 al 5, qué tan bien fue. No es una escala clínica.')
          .optional(),
      }),
      async execute({ planId, objectiveId, note, rating }) {
        await logPlanProgress(ctx, planId, { objectiveId, note, rating });
        return { registrado: true };
      },
    }),
  };
}
