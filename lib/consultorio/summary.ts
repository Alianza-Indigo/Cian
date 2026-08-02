/**
 * Borrador del resumen de sesión. Fase 10.
 *
 * ## La decisión que faltaba tomar
 *
 * El campo del resumen, la aprobación y la publicación existían desde el
 * principio; lo que faltaba era la llamada al modelo. No se hizo entonces
 * porque antes había que decidir **qué notas lo alimentan**, y esa decisión no
 * es un detalle de implementación.
 *
 * La respuesta está aquí, en `selectSummarySources`, y es: **solo lo
 * compartido**. Las notas privadas del profesional no entran, ni siquiera «como
 * contexto para que el modelo entienda mejor».
 *
 * El motivo es que una nota privada acaba en el resumen aunque el modelo no la
 * copie literalmente: resumir un texto es dejar rastro de él. Y este resumen se
 * publica para la persona atendida. Una nota privada que dice «sospecho X, hay
 * que descartarlo» convertida en «se exploraron posibles causas de X» ya reveló
 * lo que el profesional decidió no compartir todavía. El único filtro que no se
 * rompe es no dárselas.
 *
 * ## Qué protege que esto no invente
 *
 * Dos cosas, y ninguna es este archivo:
 *
 * 1. **El profesional aprueba antes de publicar.** Es criterio del PRD y ya
 *    estaba implementado: `published` arranca en `false` y solo el profesional
 *    lo cambia. Un borrador equivocado no llega a nadie.
 * 2. **El prompt prohíbe añadir.** No es una garantía —un modelo puede
 *    desobedecer— y por eso lo primero es lo que cuenta.
 *
 * ## Por qué aquí NO se aplica el barandal médico de la Fase 7
 *
 * Podría parecer que sí, y sería un error. `lib/crisis/medical-guardrail.ts`
 * impide que **CIAN** diagnostique o hable de medicación, porque CIAN no es
 * profesional de la salud. Aquí el contenido de origen lo escribió una persona
 * que sí lo es, sobre su propia consulta, y que además va a revisarlo antes de
 * publicarlo.
 *
 * Aplicar el barandal aquí bloquearía a un psiquiatra por escribir sobre
 * medicación en sus propias notas de sesión, que es literalmente su trabajo.
 * El barandal protege de que CIAN suplante a un profesional, no de que un
 * profesional ejerza.
 */

export type SummaryNote = {
  visibility: 'privada' | 'compartida';
  content: string;
};

export type SummaryTask = {
  title: string;
  description: string | null;
};

export type SummarySources = {
  notes: string[];
  tasks: string[];
};

/**
 * Lo único que puede ver el modelo.
 *
 * Filtrar aquí y no en el prompt es deliberado: un filtro escrito en lenguaje
 * natural («no uses las notas privadas») depende de que el modelo obedezca.
 * Este depende de un `if`.
 */
export function selectSummarySources(
  notes: SummaryNote[],
  tasks: SummaryTask[],
): SummarySources {
  return {
    notes: notes
      .filter((note) => note.visibility === 'compartida')
      .map((note) => note.content.trim())
      .filter((content) => content.length > 0),
    tasks: tasks
      .map((task) =>
        task.description?.trim()
          ? `${task.title.trim()} — ${task.description.trim()}`
          : task.title.trim(),
      )
      .filter((linea) => linea.length > 0),
  };
}

/** Con qué material hay que contar para que un resumen signifique algo. */
export const MIN_NOTES_FOR_SUMMARY = 1;

export function hasEnoughToSummarize(sources: SummarySources): boolean {
  return sources.notes.length >= MIN_NOTES_FOR_SUMMARY;
}

export const SUMMARY_SYSTEM = `Redactas el borrador del resumen de una sesión de acompañamiento.

Quien lo va a leer es la persona atendida. Quien lo va a revisar y aprobar antes
de que se publique es el profesional que dio la sesión.

Reglas, en orden de importancia:
- Usa ÚNICAMENTE lo que aparece en las notas y los acuerdos que se te entregan.
  No añadas causas, interpretaciones, diagnósticos ni recomendaciones que no
  estén ahí. Si algo no está, no está.
- No inventes lo que no se dijo. Es preferible un resumen corto a uno completo.
- Escribe en español de México, en segunda persona y sin tecnicismos
  innecesarios. Quien lo lee no es colega del profesional.
- Sin juicios sobre la persona ni sobre su desempeño en la sesión.
- Estructura: un párrafo breve de lo que se trabajó y, si hay acuerdos, una
  lista con ellos. Nada más.
- Máximo 250 palabras.

Responde únicamente con el resumen, sin encabezado ni preámbulo.`;

/** El material, ya filtrado, en el formato que lee el modelo. */
export function buildSummaryPrompt(sources: SummarySources): string {
  const partes = ['## Notas compartidas de la sesión', ...sources.notes.map((n) => `- ${n}`)];

  if (sources.tasks.length > 0) {
    partes.push('', '## Acuerdos y tareas', ...sources.tasks.map((t) => `- ${t}`));
  }

  return partes.join('\n');
}

/**
 * Limpia lo que devuelve el modelo.
 *
 * Quita el preámbulo típico («Aquí tienes el resumen:») aunque el prompt lo
 * prohíba, porque prohibirlo no basta, y recorta a algo que una persona pueda
 * leer de una sentada.
 */
export function tidySummary(raw: string): string {
  const limpio = raw
    .replace(/^\s*(aquí (tienes|está)|este es|resumen)[^\n:]*:\s*/i, '')
    .replace(/^["'«»\s]+|["'«»\s]+$/g, '')
    .trim();

  if (limpio.length <= 4000) return limpio;
  return `${limpio.slice(0, 3997).replace(/\s+\S*$/, '')}…`;
}
