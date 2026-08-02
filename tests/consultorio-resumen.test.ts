/**
 * Borrador del resumen de sesión. Fase 10.
 *
 * Lo único que de verdad importa comprobar aquí es que **una nota privada nunca
 * llega al modelo**. Todo lo demás del resumen es cosmética; esto no.
 *
 * El resumen se publica para la persona atendida. Una nota privada que dice
 * «sospecho X, hay que descartarlo» no hace falta que se copie literalmente
 * para hacer daño: resumida como «se exploraron posibles causas de X» ya reveló
 * lo que el profesional había decidido no compartir todavía.
 *
 * Por eso el filtro está en código y no en el prompt, y por eso se prueba en
 * dos niveles: que no salga de `selectSummarySources` y que tampoco aparezca en
 * el texto final que se le manda al modelo. Lo segundo parece redundante y no
 * lo es: si algún día alguien arma el prompt desde otra fuente, esta prueba lo
 * detiene.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildSummaryPrompt,
  hasEnoughToSummarize,
  selectSummarySources,
  tidySummary,
  MIN_NOTES_FOR_SUMMARY,
  SUMMARY_SYSTEM,
} from '../lib/consultorio/summary';

const SECRETO = 'Sospecho un trastorno del sueño, hay que descartarlo';

const NOTAS = [
  { visibility: 'privada' as const, content: SECRETO },
  { visibility: 'compartida' as const, content: 'Trabajamos la rutina de la noche' },
  { visibility: 'privada' as const, content: 'Revisar antecedentes familiares' },
  { visibility: 'compartida' as const, content: 'Acordamos bajar la luz a las 8' },
];

const TAREAS = [
  { title: 'Probar la rutina tres noches', description: null },
  { title: 'Anotar cómo durmió', description: 'Sin cronómetro, solo si costó o no' },
];

describe('lo que puede ver el modelo', () => {
  it('las notas privadas no entran', () => {
    const sources = selectSummarySources(NOTAS, TAREAS);

    assert.deepEqual(sources.notes, [
      'Trabajamos la rutina de la noche',
      'Acordamos bajar la luz a las 8',
    ]);
  });

  it('el texto que se le manda al modelo tampoco las contiene', () => {
    const prompt = buildSummaryPrompt(selectSummarySources(NOTAS, TAREAS));

    assert.ok(!prompt.includes(SECRETO), 'una nota privada llegó al prompt');
    assert.ok(!prompt.includes('antecedentes familiares'));
    assert.ok(prompt.includes('Trabajamos la rutina de la noche'));
  });

  it('los acuerdos sí entran, con su detalle', () => {
    const sources = selectSummarySources(NOTAS, TAREAS);

    assert.deepEqual(sources.tasks, [
      'Probar la rutina tres noches',
      'Anotar cómo durmió — Sin cronómetro, solo si costó o no',
    ]);
  });

  it('sin acuerdos, el prompt no inventa una sección vacía', () => {
    const prompt = buildSummaryPrompt(selectSummarySources(NOTAS, []));
    assert.ok(!prompt.includes('Acuerdos'));
  });

  it('las notas en blanco se descartan', () => {
    const sources = selectSummarySources(
      [
        { visibility: 'compartida', content: '   ' },
        { visibility: 'compartida', content: 'Algo real' },
      ],
      [],
    );

    assert.deepEqual(sources.notes, ['Algo real']);
  });
});

describe('cuándo no hay nada que resumir', () => {
  it('una sesión con solo notas privadas no alcanza', () => {
    const sources = selectSummarySources(
      [{ visibility: 'privada', content: SECRETO }],
      [],
    );

    assert.equal(hasEnoughToSummarize(sources), false);
  });

  it('una sola nota compartida alcanza', () => {
    const sources = selectSummarySources(
      [{ visibility: 'compartida', content: 'Algo' }],
      [],
    );

    assert.equal(sources.notes.length, MIN_NOTES_FOR_SUMMARY);
    assert.equal(hasEnoughToSummarize(sources), true);
  });

  it('los acuerdos por sí solos no bastan', () => {
    // Una lista de tareas sin nada de lo que se habló no es un resumen de
    // sesión, es una lista de tareas.
    const sources = selectSummarySources([], TAREAS);
    assert.equal(hasEnoughToSummarize(sources), false);
  });
});

describe('las instrucciones del modelo', () => {
  it('prohíben añadir lo que no está en las notas', () => {
    assert.match(SUMMARY_SYSTEM, /ÚNICAMENTE/);
    assert.match(SUMMARY_SYSTEM, /No inventes/i);
  });

  it('dicen quién lo lee y quién lo aprueba', () => {
    assert.match(SUMMARY_SYSTEM, /persona atendida/);
    assert.match(SUMMARY_SYSTEM, /aprobar/);
  });
});

describe('limpieza de lo que devuelve el modelo', () => {
  it('quita el preámbulo aunque el prompt lo prohíba', () => {
    assert.equal(
      tidySummary('Aquí tienes el resumen: Trabajamos la rutina.'),
      'Trabajamos la rutina.',
    );
    assert.equal(
      tidySummary('Este es el resumen de la sesión: Algo.'),
      'Algo.',
    );
  });

  it('no se come un texto que legítimamente empieza parecido', () => {
    const texto = 'Resumen de lo trabajado en la sesión de hoy sobre el sueño.';
    assert.equal(tidySummary(texto), texto);
  });

  it('quita comillas envolventes', () => {
    assert.equal(tidySummary('"Trabajamos la rutina."'), 'Trabajamos la rutina.');
  });

  it('recorta sin cortar una palabra por la mitad', () => {
    const largo = `${'palabra '.repeat(700)}final`;
    const limpio = tidySummary(largo);

    assert.ok(limpio.length <= 4000);
    assert.ok(limpio.endsWith('…'));
    assert.ok(!limpio.includes('pala…'));
  });

  it('un texto vacío se queda vacío, no se inventa nada', () => {
    assert.equal(tidySummary('   '), '');
  });
});
