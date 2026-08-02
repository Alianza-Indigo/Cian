/**
 * Conversión de un plan a contenido de documento.
 *
 * Reutiliza el generador de la Fase 2: aquí solo se produce el Markdown que
 * entiende `lib/documents/content.ts`. Así un plan exportado sale con la misma
 * plantilla institucional, folio y descargo que cualquier otro documento.
 */
import type { FullPlan } from '../db/repositories/plans';
import {
  OBJECTIVE_STATUS_LABELS,
  PLAN_STATUS_LABELS,
  PLAN_TYPE_LABELS,
} from './types';
import type { PlanProgressRow } from '../db/schema/plans';

export function planToMarkdown(
  plan: FullPlan,
  progress: PlanProgressRow[] = [],
): string {
  const lines: string[] = [];

  lines.push(
    `**${PLAN_TYPE_LABELS[plan.type]}** · ${PLAN_STATUS_LABELS[plan.status]}`,
    '',
  );

  if (plan.description) {
    lines.push(plan.description, '');
  }

  if (plan.objectives.length === 0) {
    lines.push('Este plan todavía no tiene objetivos.', '');
  }

  for (const [index, objective] of plan.objectives.entries()) {
    lines.push(`## ${index + 1}. ${objective.title}`, '');
    lines.push(`Estado: ${OBJECTIVE_STATUS_LABELS[objective.status]}`, '');

    if (objective.description) {
      lines.push(objective.description, '');
    }

    if (objective.strategies.length > 0) {
      lines.push('Estrategias:', '');
      for (const strategy of objective.strategies) {
        lines.push(`- ${strategy.content}`);
      }
      lines.push('');
    }
  }

  if (progress.length > 0) {
    lines.push('---', '', '## Seguimiento', '');

    const formatter = new Intl.DateTimeFormat('es-MX', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    for (const entry of progress) {
      const objective = plan.objectives.find(
        (candidate) => candidate.id === entry.objectiveId,
      );

      const parts = [formatter.format(entry.loggedAt)];
      if (objective) parts.push(objective.title);
      if (entry.rating) parts.push(`valoración ${entry.rating} de 5`);

      lines.push(`- ${parts.join(' · ')}`);
      if (entry.note) lines.push(`  ${entry.note}`);
    }

    lines.push('');
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
