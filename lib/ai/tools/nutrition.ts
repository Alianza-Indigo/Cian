import { tool } from 'ai';
import { z } from 'zod';
import {
  getFoodProfile,
  getPlanForWeek,
  getShoppingListForPlan,
  logAcceptedFood,
  savePlanForWeek,
  saveShoppingList,
  updateFoodProfile,
} from '../../db/repositories/nutrition';
import {
  MEAL_SLOTS,
  MEAL_SLOT_LABELS,
  TEXTURE_RESPONSES,
  WEEKDAYS,
  WEEKDAY_LABELS,
  weekStartOf,
} from '../../nutrition/types';
import type { ToolContext, ToolRegistry } from './index';

/**
 * Tools de alimentación. **Leer la regla 3.6 del PRD antes de tocar esto.**
 *
 * La selectividad alimentaria colinda con los trastornos de la conducta
 * alimentaria. Este módulo tiene prohibido emitir cantidades, calorías, metas
 * de peso, planes numéricos y restricciones.
 *
 * Esa prohibición no vive solo en estas descripciones: el repositorio pasa
 * todo el contenido por `lib/nutrition/guardrail.ts` antes de guardarlo, y si
 * lo cruza, la tool falla con un mensaje que le dice al modelo qué corregir.
 * Las descripciones son la primera línea; el barandal es la que sostiene.
 */
const NUTRITION_RULES =
  'REGLAS INNEGOCIABLES de este módulo: no menciones calorías, gramos, tazas, ' +
  'porciones ni ninguna cantidad; no hables de peso corporal ni de subir o ' +
  'bajar de peso; no prohíbas ni elimines alimentos; no clasifiques alimentos ' +
  'como buenos o malos. CIAN organiza y acompaña, no restringe. Si te piden ' +
  'algo de eso, explica con calma que ese acompañamiento corresponde a una ' +
  'persona profesional de la nutrición y ofrece lo que sí puedes: organizar ' +
  'menús con lo que ya acepta, cuidar el entorno de la comida y respetar sus ' +
  'tiempos.';

export function buildNutritionTools({ ctx }: ToolContext): ToolRegistry {
  return {
    getFoodProfile: tool({
      description:
        'Trae lo que se sabe sobre la alimentación de la persona: qué acepta, ' +
        'qué rechaza y cómo vive las texturas. Úsalo siempre antes de proponer ' +
        'un menú: un menú con lo que rechaza no sirve de nada.',
      inputSchema: z.object({}),
      async execute() {
        const profile = await getFoodProfile(ctx);

        return {
          hayPerfil: Boolean(profile),
          acepta: profile?.accepted ?? [],
          rechaza: profile?.avoided ?? [],
          texturas: profile?.textures ?? [],
          notas: profile?.notes ?? null,
        };
      },
    }),

    updateFoodProfile: tool({
      description:
        'Registra preferencias y aversiones alimentarias cuando la persona ' +
        'las cuente. Las listas se suman a lo que ya había.\n\n' +
        NUTRITION_RULES,
      inputSchema: z.object({
        accepted: z
          .array(z.string().min(1).max(200))
          .describe('Alimentos que come sin problema. Solo nombres.')
          .default([]),
        avoided: z
          .array(z.string().min(1).max(200))
          .describe(
            'Alimentos que rechaza. Es información, no una lista de prohibiciones.',
          )
          .default([]),
        textures: z
          .array(
            z.object({
              texture: z.string().min(1).max(100),
              response: z.enum(TEXTURE_RESPONSES),
            }),
          )
          .describe('Cómo vive cada textura.')
          .default([]),
        notes: z.string().max(2000).optional(),
      }),
      async execute({ accepted, avoided, textures, notes }) {
        // Si el contenido cruza la línea, el repositorio lanza y el modelo
        // recibe la explicación para reescribir.
        const profile = await updateFoodProfile(ctx, {
          accepted,
          avoided,
          textures,
          notes,
        });

        return {
          actualizado: true,
          acepta: profile.accepted.length,
          rechaza: profile.avoided.length,
        };
      },
    }),

    logAcceptedFood: tool({
      description:
        'Registra que la persona aceptó un alimento. Es lo que sí conviene ' +
        'seguir en el tiempo: qué se va sumando, nunca cuánto se comió.',
      inputSchema: z.object({
        food: z.string().min(1).max(200),
      }),
      async execute({ food }) {
        await logAcceptedFood(ctx, food);
        return { registrado: true, alimento: food };
      },
    }),

    planMeals: tool({
      description:
        'Organiza el menú de una semana con lo que la persona ya acepta. ' +
        'Úsalo ante «organiza la alimentación de esta semana».\n\n' +
        'Cada comida se describe en pocas palabras y sin números: «quesadillas ' +
        'de queso con fruta», no «2 quesadillas». Apóyate en getFoodProfile: ' +
        'repetir lo que ya funciona es un acierto, no una falta de variedad.\n\n' +
        NUTRITION_RULES,
      inputSchema: z.object({
        weekStart: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .describe('Lunes de la semana, en formato AAAA-MM-DD.')
          .optional(),
        meals: z
          .array(
            z.object({
              day: z.enum(WEEKDAYS),
              slot: z.enum(MEAL_SLOTS),
              description: z
                .string()
                .min(1)
                .max(300)
                .describe('Qué se come, sin cantidades ni números.'),
            }),
          )
          .min(1)
          .max(35),
        notes: z
          .string()
          .max(1000)
          .describe('Recordatorios de entorno o de secuencia, si aplican.')
          .optional(),
      }),
      async execute({ weekStart, meals, notes }) {
        const week = weekStart ?? weekStartOf(new Date());

        const plan: Record<string, Record<string, string>> = {};
        for (const meal of meals) {
          plan[meal.day] ??= {};
          const day = plan[meal.day];
          if (day) day[meal.slot] = meal.description;
        }

        const row = await savePlanForWeek(ctx, week, plan, notes);

        return {
          mealPlanId: row.id,
          semana: week,
          comidas: meals.length,
          aviso:
            'El menú ya está guardado y la persona puede verlo en la sección ' +
            'de alimentación. No lo repitas completo en tu respuesta.',
        };
      },
    }),

    generateShoppingList: tool({
      description:
        'Genera la lista de compras a partir de un menú ya guardado.\n\n' +
        'Solo nombres de alimentos, agrupados por sección del súper si ayuda. ' +
        '**Sin cantidades**: «manzanas», no «2 kg de manzanas». Quien compra ' +
        'sabe cuánto necesita su familia.\n\n' +
        NUTRITION_RULES,
      inputSchema: z.object({
        mealPlanId: z.uuid(),
        items: z
          .array(
            z.object({
              name: z.string().min(1).max(200),
              category: z
                .string()
                .max(80)
                .describe('Frutas y verduras, despensa, refrigerados…')
                .optional(),
            }),
          )
          .min(1)
          .max(200),
      }),
      async execute({ mealPlanId, items }) {
        const row = await saveShoppingList(ctx, mealPlanId, items);
        return {
          shoppingListId: row.id,
          articulos: row.items.length,
          aviso: 'La lista está guardada junto al menú de esa semana.',
        };
      },
    }),

    getMealPlan: tool({
      description: 'Trae el menú de una semana y su lista de compras.',
      inputSchema: z.object({
        weekStart: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
      }),
      async execute({ weekStart }) {
        const week = weekStart ?? weekStartOf(new Date());
        const plan = await getPlanForWeek(ctx, week);

        if (!plan) return { encontrado: false, semana: week };

        const list = await getShoppingListForPlan(ctx, plan.id);

        return {
          encontrado: true,
          semana: week,
          menu: Object.entries(plan.plan).map(([day, slots]) => ({
            dia: WEEKDAY_LABELS[day as keyof typeof WEEKDAY_LABELS] ?? day,
            comidas: Object.entries(slots ?? {}).map(([slot, description]) => ({
              momento: MEAL_SLOT_LABELS[slot as keyof typeof MEAL_SLOT_LABELS] ?? slot,
              descripcion: description,
            })),
          })),
          listaDeCompras: list?.items.map((item) => item.name) ?? [],
        };
      },
    }),
  };
}
