/**
 * Genera el borrador del resumen con el modelo. Fase 10.
 *
 * Separado de `./summary` a propósito: allí vive lo que se puede probar sin
 * red —qué material entra y qué sale limpio—, y aquí lo que necesita modelo y
 * base de datos.
 *
 * **Guardar el borrador deja el resumen sin publicar.** Eso ya lo garantiza
 * `saveSessionSummary`, que pone `published: false` en cada escritura: un texto
 * nuevo no puede heredar la aprobación que era para el anterior. Aquí no hace
 * falta repetirlo, pero conviene saber que de eso depende que esto sea seguro.
 */
import { generateText } from 'ai';
import { utilityModel, UTILITY_MODEL_ID, isModelConfigured } from '../ai/provider';
import {
  getSessionForParticipant,
  listSessionNotes,
  listSessionTasks,
  saveSessionSummary,
} from '../db/repositories/consultorio';
import { recordUsage } from '../db/repositories/usage';
import type { TenantContext } from '../tenant/guard';
import {
  buildSummaryPrompt,
  hasEnoughToSummarize,
  selectSummarySources,
  tidySummary,
  SUMMARY_SYSTEM,
} from './summary';

export type DraftResult =
  | { ok: true; content: string }
  | { ok: false; reason: string };

export async function generateSessionSummaryDraft(
  ctx: TenantContext,
  sessionId: string,
): Promise<DraftResult> {
  const found = await getSessionForParticipant(ctx, sessionId);
  if (!found) return { ok: false, reason: 'No encontramos esa sesión.' };

  if (found.role !== 'profesional') {
    return { ok: false, reason: 'El resumen lo genera y aprueba el profesional.' };
  }

  if (!isModelConfigured()) {
    return {
      ok: false,
      reason:
        'El modelo no está configurado. Puedes escribir el resumen a mano; el ' +
        'campo es el mismo.',
    };
  }

  const [notes, tasks] = await Promise.all([
    listSessionNotes(ctx, sessionId),
    listSessionTasks(ctx, sessionId),
  ]);

  /*
   * `listSessionNotes` le devuelve al profesional TODAS sus notas, incluidas
   * las privadas: es su pantalla y son suyas. El filtro de lo que ve el modelo
   * es `selectSummarySources`, y es el único que hay.
   */
  const sources = selectSummarySources(notes, tasks);

  if (!hasEnoughToSummarize(sources)) {
    return {
      ok: false,
      reason:
        'No hay notas compartidas de esta sesión. El resumen se arma con lo ' +
        'compartido; las notas privadas no entran, porque este texto lo va a ' +
        'leer la persona atendida.',
    };
  }

  try {
    const result = await generateText({
      model: utilityModel(),
      system: SUMMARY_SYSTEM,
      prompt: buildSummaryPrompt(sources),
      maxOutputTokens: 600,
    });

    const content = tidySummary(result.text);
    if (content.length === 0) {
      return { ok: false, reason: 'El modelo devolvió un resumen vacío.' };
    }

    await saveSessionSummary(ctx, sessionId, content);

    await recordUsage(ctx, {
      kind: 'summary',
      model: UTILITY_MODEL_ID,
      tokensIn: result.usage.inputTokens ?? 0,
      tokensOut: result.usage.outputTokens ?? 0,
    });

    return { ok: true, content };
  } catch {
    return {
      ok: false,
      reason:
        'No pudimos generar el borrador. Puedes escribirlo a mano en el mismo ' +
        'campo.',
    };
  }
}
