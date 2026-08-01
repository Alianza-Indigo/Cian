import { tool } from 'ai';
import { z } from 'zod';
import { getEffectivePreferences } from '../../db/repositories/preferences';
import { getCurrentTenant } from '../../db/repositories/tenants';
import type { ToolContext, ToolRegistry } from './index';

/**
 * `getUserContext` — quién es la persona con la que está hablando.
 *
 * Devuelve preferencias y perfil, nunca datos de otras personas del tenant.
 * El nivel de detalle configurado se entrega traducido a una instrucción
 * accionable, no como un código interno que el modelo tendría que interpretar.
 */
const DETAIL_GUIDANCE = {
  brief: 'Responde corto y directo, en pocas líneas.',
  balanced: 'Responde lo necesario para entender y actuar, sin extenderte de más.',
  detailed: 'Puedes extenderte, dar contexto y ejemplos.',
} as const;

export function buildUserContextTools({ ctx }: ToolContext): ToolRegistry {
  return {
    getUserContext: tool({
      description:
        'Obtiene el contexto de la persona con la que estás hablando: su espacio, ' +
        'sus preferencias de accesibilidad y qué tanto detalle quiere en las ' +
        'respuestas. Úsalo cuando necesites ajustar el tono o la extensión.',
      inputSchema: z.object({}),
      async execute() {
        const [preferences, tenant] = await Promise.all([
          getEffectivePreferences(ctx),
          getCurrentTenant(ctx),
        ]);

        return {
          espacio: tenant?.name ?? 'Espacio personal',
          rol: ctx.role,
          nivelDeDetalle: preferences.detailLevel,
          comoResponder: DETAIL_GUIDANCE[preferences.detailLevel],
          prefiereMovimientoReducido: preferences.reducedMotion,
        };
      },
    }),
  };
}
