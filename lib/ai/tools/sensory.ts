import { tool } from 'ai';
import { z } from 'zod';
import {
  addSensoryTool,
  getSensoryProfile,
  listSensoryProfiles,
  listSensoryTools,
  logSensoryEvent,
  updateSensoryProfile,
} from '../../db/repositories/sensory';
import {
  EVENT_OUTCOMES,
  INTENSITY_MAX,
  INTENSITY_MIN,
  SENSITIVITY_LABELS,
  SENSITIVITY_LEVELS,
  SENSORY_DOMAINS,
  SENSORY_DOMAIN_HINTS,
  SENSORY_DOMAIN_LABELS,
} from '../../sensory/types';
import type { ToolContext, ToolRegistry } from './index';

const domainCatalog = SENSORY_DOMAINS.map(
  (domain) =>
    `- ${domain} (${SENSORY_DOMAIN_LABELS[domain]}): ${SENSORY_DOMAIN_HINTS[domain]}`,
).join('\n');

export function buildSensoryTools({ ctx }: ToolContext): ToolRegistry {
  return {
    getSensoryProfile: tool({
      description:
        'Trae el perfil sensorial de la persona: qué le afecta en cada ' +
        'dominio, qué lo dispara y qué estrategias ya le han funcionado. ' +
        'Úsalo antes de sugerir cualquier cosa sensorial: lo que ya funciona ' +
        'vale más que una idea nueva.',
      inputSchema: z.object({}),
      async execute() {
        const [profiles, tools] = await Promise.all([
          listSensoryProfiles(ctx),
          listSensoryTools(ctx),
        ]);

        return {
          perfiles: profiles.map((profile) => ({
            dominio: SENSORY_DOMAIN_LABELS[profile.domain],
            sensibilidad: SENSITIVITY_LABELS[profile.sensitivity],
            disparadores: profile.triggers,
            estrategiasQueFuncionan: profile.strategies,
          })),
          herramientas: tools.map((item) => ({
            nombre: item.name,
            leFunciona: item.effective,
          })),
        };
      },
    }),

    updateSensoryProfile: tool({
      description:
        'Actualiza el perfil sensorial cuando la persona cuente algo nuevo. ' +
        'Ejemplo: ante «le molesta mucho el ruido del comedor», registra el ' +
        'dominio sonidos con ese disparador. Los disparadores y estrategias se ' +
        'suman a los que ya había, no los reemplazan.\n\n' +
        `Dominios:\n${domainCatalog}`,
      inputSchema: z.object({
        domain: z.enum(SENSORY_DOMAINS),
        sensitivity: z.enum(SENSITIVITY_LEVELS).optional(),
        triggers: z
          .array(z.string().min(1).max(300))
          .describe('Situaciones concretas que lo disparan.')
          .default([]),
        strategies: z
          .array(z.string().min(1).max(300))
          .describe('Lo que ya se probó y funcionó, si se sabe.')
          .default([]),
      }),
      async execute({ domain, sensitivity, triggers, strategies }) {
        const profile = await updateSensoryProfile(ctx, {
          domain,
          sensitivity,
          triggers,
          strategies,
        });

        return {
          actualizado: true,
          dominio: SENSORY_DOMAIN_LABELS[profile.domain],
          disparadores: profile.triggers,
          estrategias: profile.strategies,
        };
      },
    }),

    logSensoryEvent: tool({
      description:
        'Registra un momento de sobrecarga o desregulación sensorial: qué ' +
        'pasó, qué se intentó y cómo terminó. Con el tiempo esto es lo que ' +
        'permite ver patrones.',
      inputSchema: z.object({
        domain: z.enum(SENSORY_DOMAINS),
        intensity: z
          .number()
          .int()
          .min(INTENSITY_MIN)
          .max(INTENSITY_MAX)
          .describe('Del 1 al 5, cómo se vivió. No es una escala clínica.')
          .optional(),
        context: z
          .string()
          .max(2000)
          .describe('Dónde, cuándo y qué estaba pasando.'),
        strategyUsed: z.string().max(500).optional(),
        outcome: z.enum(EVENT_OUTCOMES).optional(),
      }),
      async execute({ domain, intensity, context, strategyUsed, outcome }) {
        await logSensoryEvent(ctx, {
          domain,
          intensity,
          context,
          strategyUsed,
          outcome,
        });
        return { registrado: true };
      },
    }),

    suggestRegulationStrategy: tool({
      description:
        'Trae las estrategias y herramientas que YA le han funcionado a esta ' +
        'persona en un dominio sensorial. Úsalo antes de proponer algo nuevo: ' +
        'la respuesta debe apoyarse en lo que ya sirve y solo entonces ' +
        'agregar ideas.',
      inputSchema: z.object({ domain: z.enum(SENSORY_DOMAINS) }),
      async execute({ domain }) {
        const [profile, tools] = await Promise.all([
          getSensoryProfile(ctx, domain),
          listSensoryTools(ctx),
        ]);

        const relevantTools = tools.filter(
          (item) => item.domain === domain || item.domain === null,
        );

        return {
          dominio: SENSORY_DOMAIN_LABELS[domain],
          hayPerfil: Boolean(profile),
          sensibilidad: profile ? SENSITIVITY_LABELS[profile.sensitivity] : null,
          disparadoresConocidos: profile?.triggers ?? [],
          estrategiasQueYaFuncionaron: profile?.strategies ?? [],
          herramientasEfectivas: relevantTools
            .filter((item) => item.effective === true)
            .map((item) => item.name),
          herramientasQueNoFuncionaron: relevantTools
            .filter((item) => item.effective === false)
            .map((item) => item.name),
        };
      },
    }),

    addSensoryTool: tool({
      description:
        'Guarda una herramienta o ambiente seguro que la persona usa: ' +
        'audífonos, una cobija con peso, un rincón tranquilo.',
      inputSchema: z.object({
        name: z.string().min(1).max(200),
        description: z.string().max(1000).optional(),
        domain: z.enum(SENSORY_DOMAINS).optional(),
        effective: z
          .boolean()
          .describe('Si ya se sabe que le funciona o que no.')
          .optional(),
      }),
      async execute({ name, description, domain, effective }) {
        const row = await addSensoryTool(ctx, {
          name,
          description,
          domain,
          effective,
        });
        return { guardada: true, nombre: row.name };
      },
    }),
  };
}
