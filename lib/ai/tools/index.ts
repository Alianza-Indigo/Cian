/**
 * Registro de tools del orquestador. Regla 3.2 del PRD.
 *
 * El modelo decide qué usar; el código no adivina la intención con palabras
 * clave ni clasificadores. Agregar un módulo en una fase posterior significa
 * registrar tools nuevas aquí, **nunca** tocar la lógica del orquestador.
 *
 * Toda tool recibe el `TenantContext` por cierre, jamás como argumento del
 * modelo: el modelo no debe poder elegir sobre qué tenant opera.
 */
import type { Tool } from 'ai';
import type { TenantContext } from '../../tenant/guard';
import { buildMemoryTools } from './memory';
import { buildUserContextTools } from './user-context';
import { buildDocumentTools } from './documents';
import { buildPlanTools } from './plans';
import { buildRoutineTools } from './routines';
import { buildSensoryTools } from './sensory';
import { buildTaskTools } from './tasks';
import { buildNutritionTools } from './nutrition';
import { buildLibraryTools } from './library';
import { buildEducationTools } from './education';
import { buildCrisisTools } from './crisis';
import { buildTeamTools } from './team';
import { buildReminderTools } from './reminders';

export type ToolRegistry = Record<string, Tool>;

export type ToolContext = {
  ctx: TenantContext;
  /** Mensaje que originó el turno, para poder rastrear de dónde salió una memoria. */
  sourceMessageId: string | null;
  /** Conversación en curso, para dejar el documento ligado a su origen. */
  conversationId: string | null;
};

export function buildTools(toolContext: ToolContext): ToolRegistry {
  return {
    ...buildUserContextTools(toolContext),
    ...buildMemoryTools(toolContext),
    ...buildDocumentTools(toolContext),
    ...buildPlanTools(toolContext),
    ...buildRoutineTools(toolContext),
    ...buildSensoryTools(toolContext),
    ...buildTaskTools(toolContext),
    ...buildNutritionTools(toolContext),
    ...buildLibraryTools(toolContext),
    ...buildEducationTools(toolContext),
    ...buildCrisisTools(toolContext),
    ...buildTeamTools(toolContext),
    ...buildReminderTools(toolContext),
  };
}
