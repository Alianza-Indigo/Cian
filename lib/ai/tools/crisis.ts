import { tool } from 'ai';
import { z } from 'zod';
import {
  closeCrisisEvent,
  getOpenCrisisEvent,
  linkPostPlan,
  listCrisisEvents,
  listCrisisProtocols,
  saveCrisisProtocol,
  startCrisisEvent,
} from '../../db/repositories/crisis';
import {
  listSensoryEvents,
  listSensoryProfiles,
  listSensoryTools,
} from '../../db/repositories/sensory';
import { createPlan } from '../../db/repositories/plans';
import { getPromptOrFallback, CRISIS_FALLBACK } from '../prompts';
import { assertSafeCrisisContent } from '../../crisis/medical-guardrail';
import { summarizeCrisisPatterns } from '../../crisis/patterns';
import {
  CRISIS_OUTCOMES,
  CRISIS_OUTCOME_LABELS,
  CRISIS_SEVERITIES,
  CRISIS_SEVERITY_HINTS,
  CRISIS_SEVERITY_LABELS,
  MAX_CRISIS_STEPS,
} from '../../crisis/types';
import { SENSORY_DOMAIN_LABELS } from '../../sensory/types';
import type { ToolContext, ToolRegistry } from './index';

const severityCatalog = CRISIS_SEVERITIES.map(
  (severity) =>
    `- ${severity} (${CRISIS_SEVERITY_LABELS[severity]}): ${CRISIS_SEVERITY_HINTS[severity]}`,
).join('\n');

const stepSchema = z.object({
  title: z
    .string()
    .min(1)
    .max(200)
    .describe('La acción, en imperativo y en una línea. «Baja las luces».'),
  detail: z
    .string()
    .max(500)
    .describe('Una precisión corta, solo si hace falta. Casi nunca hace falta.')
    .optional(),
});

/**
 * Tools del módulo de crisis. Fase 7.
 *
 * Dos cosas las distinguen del resto de módulos.
 *
 * La primera: **todo el texto que escribe el modelo pasa por el barandal
 * médico** antes de guardarse o mostrarse. Si sugiere medicación, diagnostica,
 * interpreta síntomas, propone contención física o resta importancia, la tool
 * falla con una explicación y el modelo reescribe. El prompt lo pide; esto lo
 * garantiza.
 *
 * La segunda: `activateCrisisSupport` no solo registra —enciende el modo
 * simplificado en pantalla—. Por eso exige los pasos en el esquema: son lo que
 * la interfaz va a mostrar en grande, y tienen que existir como datos, no como
 * prosa dentro de la respuesta.
 */
export function buildCrisisTools({
  ctx,
  conversationId,
}: ToolContext): ToolRegistry {
  return {
    getCrisisStrategies: tool({
      description:
        'Consulta TODO lo que ya se sabe de esta persona antes de proponer ' +
        'nada en una crisis: perfil sensorial, herramientas que le funcionan, ' +
        'disparadores conocidos, protocolos guardados y episodios anteriores. ' +
        'Llámalo siempre primero. Lo que ya funcionó vale más que una idea nueva.',
      inputSchema: z.object({}),
      async execute() {
        const [guide, profiles, tools, protocols, episodes, sensoryEvents] =
          await Promise.all([
            getPromptOrFallback('crisis.system', CRISIS_FALLBACK),
            listSensoryProfiles(ctx),
            listSensoryTools(ctx),
            listCrisisProtocols(ctx, true),
            listCrisisEvents(ctx, 20),
            listSensoryEvents(ctx, 20),
          ]);

        const patterns = summarizeCrisisPatterns(
          episodes.map((episode) => ({
            occurredAt: episode.startedAt,
            severity: episode.severity,
            triggers: episode.triggers,
            actionsTaken: episode.actionsTaken,
            outcome: episode.outcome,
            escalated: episode.escalated,
          })),
        );

        return {
          guiaDeCrisis: guide,
          estrategiasQueYaFuncionaron: profiles.flatMap((profile) =>
            profile.strategies.map(
              (strategy) => `${SENSORY_DOMAIN_LABELS[profile.domain]}: ${strategy}`,
            ),
          ),
          herramientasEfectivas: tools
            .filter((item) => item.effective === true)
            .map((item) => item.name),
          herramientasQueNoFuncionaron: tools
            .filter((item) => item.effective === false)
            .map((item) => item.name),
          disparadoresConocidos: [
            ...new Set([
              ...profiles.flatMap((profile) => profile.triggers),
              ...patterns.triggers.map((entry) => entry.label),
            ]),
          ],
          protocolosGuardados: protocols.map((protocol) => ({
            titulo: protocol.title,
            pasos: protocol.steps.map((step) => step.title),
          })),
          loQueSirvioAntes: patterns.helped.map(
            (entry) => `${entry.label} (sirvió ${entry.count} ${entry.count === 1 ? 'vez' : 'veces'})`,
          ),
          loQueNoSirvio: patterns.didNotHelp.map((entry) => entry.label),
          episodiosRegistrados: patterns.total,
          desregulacionesSensorialesRecientes: sensoryEvents.slice(0, 5).map((event) => ({
            dominio: SENSORY_DOMAIN_LABELS[event.domain],
            contexto: event.context,
            estrategia: event.strategyUsed,
          })),
        };
      },
    }),

    activateCrisisSupport: tool({
      description:
        'Enciende el modo crisis: la interfaz se simplifica y muestra tus ' +
        'pasos en grande, para usarse con una sola mano. Úsalo cuando la ' +
        'persona esté viviendo una crisis AHORA («llegó muy alterado», «no ' +
        'para de llorar», «está en pleno colapso»), no cuando la recuerde.\n\n' +
        'Consulta antes getCrisisStrategies: los pasos deben apoyarse en lo ' +
        'que ya le funciona a esta persona.\n\n' +
        `Intensidad:\n${severityCatalog}`,
      inputSchema: z.object({
        situation: z
          .string()
          .min(1)
          .max(1000)
          .describe('Qué está pasando, en una frase. Sin interpretaciones.'),
        severity: z.enum(CRISIS_SEVERITIES),
        triggers: z
          .array(z.string().min(1).max(300))
          .describe('Lo que se sabe que la disparó, si se sabe.')
          .default([]),
        steps: z
          .array(stepSchema)
          .min(1)
          .max(MAX_CRISIS_STEPS)
          .describe(
            'Los pasos a hacer ahora mismo, en orden. Máximo ' +
              `${MAX_CRISIS_STEPS}. Cada uno se hace en menos de un minuto, sin ` +
              'salir de casa y sin comprar nada.',
          ),
      }),
      async execute({ situation, severity, triggers, steps }) {
        assertSafeCrisisContent([
          situation,
          ...steps.flatMap((step) => [step.title, step.detail]),
        ]);

        const event = await startCrisisEvent(ctx, {
          conversationId,
          severity,
          triggers,
        });

        return {
          modoCrisis: true,
          crisisEventId: event.id,
          intensidad: CRISIS_SEVERITY_LABELS[severity],
          pasos: steps,
        };
      },
    }),

    logCrisisEpisode: tool({
      description:
        'Registra el episodio cuando ya pasó: qué ocurrió, qué lo disparó, ' +
        'qué se intentó y qué funcionó. Sirve tanto para el episodio que se ' +
        'acaba de acompañar como para uno que la persona cuenta después. ' +
        'Anota también lo que NO funcionó: vale igual.',
      inputSchema: z.object({
        crisisEventId: z
          .string()
          .describe('El identificador que devolvió activateCrisisSupport, si lo hay.')
          .optional(),
        summary: z
          .string()
          .min(1)
          .max(4000)
          .describe('Qué pasó, en palabras de la persona. Sin interpretar.'),
        severity: z.enum(CRISIS_SEVERITIES).optional(),
        triggers: z.array(z.string().min(1).max(300)).default([]),
        actionsTaken: z
          .array(
            z.object({
              action: z.string().min(1).max(300),
              helped: z
                .boolean()
                .describe('Si sirvió. Omítelo si no se sabe.')
                .optional(),
            }),
          )
          .default([]),
        outcome: z.enum(CRISIS_OUTCOMES).optional(),
      }),
      async execute({
        crisisEventId,
        summary,
        severity,
        triggers,
        actionsTaken,
        outcome,
      }) {
        assertSafeCrisisContent([
          summary,
          ...triggers,
          ...actionsTaken.map((entry) => entry.action),
        ]);

        const event = await closeCrisisEvent(ctx, {
          eventId: crisisEventId ?? null,
          conversationId,
          summary,
          severity,
          triggers,
          actionsTaken: actionsTaken.map((entry) => ({
            action: entry.action,
            helped: entry.helped ?? null,
          })),
          outcome: outcome ?? null,
        });

        return {
          registrado: true,
          crisisEventId: event.id,
          comoTermino: event.outcome
            ? CRISIS_OUTCOME_LABELS[event.outcome]
            : 'sin registrar',
        };
      },
    }),

    saveCrisisProtocol: tool({
      description:
        'Guarda los pasos que funcionaron como protocolo reutilizable, para ' +
        'tenerlos a la mano la próxima vez sin tener que explicarlo todo de ' +
        'nuevo. Ofrécelo cuando algo haya servido de verdad, no por rutina.',
      inputSchema: z.object({
        title: z
          .string()
          .min(1)
          .max(200)
          .describe('Cómo reconocerlo después. «Crisis al volver de la escuela».'),
        steps: z.array(stepSchema).min(1).max(MAX_CRISIS_STEPS),
      }),
      async execute({ title, steps }) {
        assertSafeCrisisContent([
          title,
          ...steps.flatMap((step) => [step.title, step.detail]),
        ]);

        const protocol = await saveCrisisProtocol(ctx, { title, steps });
        return { guardado: true, titulo: protocol.title, pasos: protocol.steps.length };
      },
    }),

    createPostCrisisPlan: tool({
      description:
        'Genera el plan posterior a partir del episodio registrado y lo deja ' +
        'ligado a él en el módulo de Planes. Es para después, en frío: ' +
        'anticipar el disparador, preparar el entorno, acordar qué hará cada ' +
        'quien la próxima vez. Nunca lo propongas en plena crisis.',
      inputSchema: z.object({
        crisisEventId: z.string().optional(),
        title: z.string().min(1).max(200),
        description: z.string().max(2000).optional(),
        objectives: z
          .array(
            z.object({
              title: z.string().min(1).max(300),
              description: z.string().max(1000).optional(),
              strategies: z.array(z.string().min(1).max(1000)).default([]),
            }),
          )
          .min(1)
          .max(5),
      }),
      async execute({ crisisEventId, title, description, objectives }) {
        assertSafeCrisisContent([
          title,
          description,
          ...objectives.flatMap((objective) => [
            objective.title,
            objective.description,
            ...objective.strategies,
          ]),
        ]);

        const plan = await createPlan(ctx, {
          type: 'seguimiento',
          title,
          description,
          conversationId,
          objectives,
        });

        const eventId =
          crisisEventId ?? (await getOpenCrisisEvent(ctx, conversationId))?.id;
        if (eventId) await linkPostPlan(ctx, eventId, plan.id);

        return {
          creado: true,
          planId: plan.id,
          ligadoAlEpisodio: Boolean(eventId),
          objetivos: plan.objectives.length,
        };
      },
    }),

    getCrisisHistory: tool({
      description:
        'Bitácora de crisis con su vista de patrones: cuántas hubo, qué las ' +
        'dispara más seguido, qué sirve y qué no. Úsalo cuando pregunten ' +
        '«¿esto pasa seguido?», «¿cuándo le pasa más?» o al preparar una ' +
        'reunión o una consulta.',
      inputSchema: z.object({
        limit: z.number().int().min(1).max(60).default(30),
      }),
      async execute({ limit }) {
        const episodes = await listCrisisEvents(ctx, limit);

        const patterns = summarizeCrisisPatterns(
          episodes.map((episode) => ({
            occurredAt: episode.startedAt,
            severity: episode.severity,
            triggers: episode.triggers,
            actionsTaken: episode.actionsTaken,
            outcome: episode.outcome,
            escalated: episode.escalated,
          })),
        );

        return {
          total: patterns.total,
          hayDatosSuficientesParaPatrones: patterns.enoughData,
          disparadoresMasFrecuentes: patterns.triggers.slice(0, 8),
          loQueSirve: patterns.helped.slice(0, 8),
          loQueNoSirve: patterns.didNotHelp.slice(0, 8),
          porIntensidad: patterns.bySeverity,
          comoTerminaron: patterns.byOutcome.map((entry) => ({
            ...entry,
            label:
              CRISIS_OUTCOME_LABELS[
                entry.label as keyof typeof CRISIS_OUTCOME_LABELS
              ] ?? entry.label,
          })),
          /*
           * Sin franjas horarias a propósito: este código corre en un servidor
           * en UTC y decir «le pasa por la tarde» con seis horas de desfase es
           * peor que no decirlo. Eso se calcula en el navegador y se ve en la
           * bitácora.
           */
          episodios: episodes.slice(0, 10).map((episode) => ({
            fecha: episode.startedAt.toISOString().slice(0, 10),
            intensidad: CRISIS_SEVERITY_LABELS[episode.severity],
            resumen: episode.summary,
            disparadores: episode.triggers,
            seDerivo: episode.escalated,
          })),
        };
      },
    }),
  };
}
