import { tool } from 'ai';
import { z } from 'zod';
import { createEducationItem } from '../../db/repositories/education';
import {
  EDUCATION_KIND_LABELS,
  UDL_PRINCIPLES,
  UDL_PRINCIPLE_LABELS,
} from '../../library/types';
import type { ToolContext, ToolRegistry } from './index';

const citationSchema = z
  .array(z.object({ slug: z.string().min(1), title: z.string().min(1) }))
  .describe(
    'Recursos de la biblioteca en los que te apoyaste, si usaste searchLibrary.',
  )
  .default([]);

export function buildEducationTools({ ctx }: ToolContext): ToolRegistry {
  return {
    createEducationalAdaptation: tool({
      description:
        'Crea una adaptación educativa organizada por los tres principios del ' +
        'Diseño Universal para el Aprendizaje. Úsala cuando pidan ajustes para ' +
        'que alguien pueda participar en clase.\n\n' +
        'Los ajustes deben ser concretos y de bajo costo: algo que una maestra ' +
        'pueda hacer el lunes sin personal adicional. «Anticipar los cambios ' +
        'de actividad con un aviso de dos minutos», no «favorecer la ' +
        'anticipación».\n\n' +
        'Consulta searchLibrary antes: hay contenido revisado sobre ajustes ' +
        'razonables y sobre DUA.',
      inputSchema: z.object({
        title: z.string().min(1).max(200),
        summary: z
          .string()
          .max(1000)
          .describe('Qué barrera se busca reducir, en dos o tres frases.'),
        representacion: z
          .array(z.string().min(1).max(500))
          .describe(UDL_PRINCIPLE_LABELS.representacion)
          .default([]),
        accionExpresion: z
          .array(z.string().min(1).max(500))
          .describe(UDL_PRINCIPLE_LABELS.accion_expresion)
          .default([]),
        implicacion: z
          .array(z.string().min(1).max(500))
          .describe(UDL_PRINCIPLE_LABELS.implicacion)
          .default([]),
        citations: citationSchema,
      }),
      async execute({
        title,
        summary,
        representacion,
        accionExpresion,
        implicacion,
        citations,
      }) {
        const item = await createEducationItem(ctx, {
          kind: 'adaptacion',
          title,
          payload: {
            summary,
            udl: {
              representacion,
              accion_expresion: accionExpresion,
              implicacion,
            },
            citations,
          },
        });

        const total =
          representacion.length + accionExpresion.length + implicacion.length;

        return {
          educationItemId: item.id,
          titulo: item.title,
          ajustes: total,
          principiosCubiertos: UDL_PRINCIPLES.filter((principle) => {
            const map = {
              representacion,
              accion_expresion: accionExpresion,
              implicacion,
            };
            return map[principle].length > 0;
          }).length,
          aviso:
            'La adaptación está guardada en la sección de Educación y puede ' +
            'exportarse a PDF desde ahí.',
        };
      },
    }),

    generateVisualSchedule: tool({
      description:
        'Crea una agenda visual: la secuencia de una jornada o de una ' +
        'actividad, pensada para imprimirse.\n\n' +
        'Entre cuatro y seis pasos; un solo verbo por paso («ponerse los ' +
        'zapatos», no «alistarse»); y el último paso debe ser el final ' +
        'explícito («y después, jugar»), porque una secuencia sin final ' +
        'visible se siente interminable.',
      inputSchema: z.object({
        title: z.string().min(1).max(200),
        steps: z
          .array(
            z.object({
              title: z.string().min(1).max(200),
              icon: z.string().max(4).describe('Un emoji, opcional.').optional(),
              note: z.string().max(300).optional(),
            }),
          )
          .min(2)
          .max(8),
        citations: citationSchema,
      }),
      async execute({ title, steps, citations }) {
        const item = await createEducationItem(ctx, {
          kind: 'agenda_visual',
          title,
          payload: { steps, citations },
        });

        return {
          educationItemId: item.id,
          titulo: item.title,
          pasos: steps.length,
          aviso:
            'La agenda está guardada en Educación y puede exportarse a PDF ' +
            'imprimible desde ahí.',
        };
      },
    }),

    prepareSchoolMeeting: tool({
      description:
        'Prepara una reunión con la escuela: guion con los puntos a plantear, ' +
        'su respaldo y las preguntas que conviene hacer. Úsalo ante «necesito ' +
        'preparar una reunión con la maestra».\n\n' +
        'Como máximo cuatro puntos: más de eso dispersa la conversación y la ' +
        'escuela se queda con que nada se puede resolver. Cada punto describe ' +
        'algo observable («llega llorando tres de cinco días»), no una ' +
        'impresión general.\n\n' +
        'Consulta searchLibrary: hay contenido revisado sobre cómo preparar ' +
        'estas reuniones y sobre qué información conviene compartir y cuál no.',
      inputSchema: z.object({
        title: z.string().min(1).max(200),
        summary: z
          .string()
          .max(1000)
          .describe('Para qué es la reunión y con quién.'),
        talkingPoints: z
          .array(
            z.object({
              point: z
                .string()
                .min(1)
                .max(500)
                .describe('Qué se plantea, en términos observables.'),
              support: z
                .string()
                .max(500)
                .describe('Con qué se respalda: registros, fechas, ejemplos.')
                .optional(),
            }),
          )
          .min(1)
          .max(4),
        questions: z
          .array(z.string().min(1).max(300))
          .describe('Preguntas para la escuela.')
          .default([]),
        citations: citationSchema,
      }),
      async execute({ title, summary, talkingPoints, questions, citations }) {
        const item = await createEducationItem(ctx, {
          kind: 'reunion_escolar',
          title,
          payload: { summary, talkingPoints, questions, citations },
        });

        return {
          educationItemId: item.id,
          titulo: item.title,
          puntos: talkingPoints.length,
          aviso:
            'El guion está guardado en Educación. Ofrécele exportarlo a PDF ' +
            'para llevarlo impreso a la reunión.',
        };
      },
    }),

    createLessonSupport: tool({
      description:
        'Crea material de apoyo para docentes sobre un contenido concreto, ' +
        'con los principios del Diseño Universal para el Aprendizaje ' +
        'aplicados a ese contenido y no en abstracto.',
      inputSchema: z.object({
        title: z.string().min(1).max(200),
        summary: z
          .string()
          .max(1000)
          .describe('Qué contenido es y para qué grupo.'),
        representacion: z.array(z.string().min(1).max(500)).default([]),
        accionExpresion: z.array(z.string().min(1).max(500)).default([]),
        implicacion: z.array(z.string().min(1).max(500)).default([]),
        citations: citationSchema,
      }),
      async execute({
        title,
        summary,
        representacion,
        accionExpresion,
        implicacion,
        citations,
      }) {
        const item = await createEducationItem(ctx, {
          kind: 'apoyo_de_clase',
          title,
          payload: {
            summary,
            udl: {
              representacion,
              accion_expresion: accionExpresion,
              implicacion,
            },
            citations,
          },
        });

        return {
          educationItemId: item.id,
          titulo: item.title,
          tipo: EDUCATION_KIND_LABELS.apoyo_de_clase,
          aviso: 'El material está guardado en Educación.',
        };
      },
    }),
  };
}
