/**
 * Exportación de materiales educativos a documento.
 *
 * Reutiliza el generador de la Fase 2. Cada tipo se maqueta distinto porque se
 * usa distinto: una agenda visual se imprime y se pega en la pared, y un guion
 * de reunión se lleva en la mano y se va tachando.
 */
import type { EducationItemRow } from '../db/schema/library';
import {
  EDUCATION_KIND_LABELS,
  UDL_PRINCIPLES,
  UDL_PRINCIPLE_LABELS,
} from './types';

export function educationItemToMarkdown(item: EducationItemRow): string {
  const lines: string[] = [`**${EDUCATION_KIND_LABELS[item.kind]}**`, ''];
  const payload = item.payload;

  if (payload.summary) {
    lines.push(payload.summary, '');
  }

  // --- Agenda visual: pasos numerados y grandes --------------------------
  if (item.kind === 'agenda_visual' && payload.steps?.length) {
    lines.push('## Secuencia', '');
    for (const [index, step] of payload.steps.entries()) {
      const icon = step.icon ? `${step.icon} ` : '';
      lines.push(`${index + 1}. ${icon}${step.title}`);
      if (step.note) lines.push(`   ${step.note}`);
    }
    lines.push('');
  }

  // --- Adaptaciones y apoyo de clase: por principio del DUA ---------------
  if (payload.udl) {
    for (const principle of UDL_PRINCIPLES) {
      const items = payload.udl[principle];
      if (!items || items.length === 0) continue;

      lines.push(`## ${UDL_PRINCIPLE_LABELS[principle]}`, '');
      for (const entry of items) lines.push(`- ${entry}`);
      lines.push('');
    }
  }

  // --- Reunión escolar: puntos con respaldo, y preguntas -------------------
  if (payload.talkingPoints?.length) {
    lines.push('## Puntos a plantear', '');
    for (const [index, point] of payload.talkingPoints.entries()) {
      lines.push(`${index + 1}. ${point.point}`);
      if (point.support) lines.push(`   Respaldo: ${point.support}`);
      lines.push('');
    }
  }

  if (payload.questions?.length) {
    lines.push('## Preguntas para la escuela', '');
    for (const question of payload.questions) lines.push(`- [ ] ${question}`);
    lines.push('');
  }

  if (payload.citations?.length) {
    lines.push('---', '', '## Se apoya en', '');
    for (const citation of payload.citations) {
      lines.push(`- ${citation.title}`);
    }
    lines.push('');
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
