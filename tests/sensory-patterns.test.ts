/**
 * Vista de patrones de la bitácora sensorial. Fase 5.
 *
 * Lo que se comprueba aquí no es que la aritmética sume, sino que la vista no
 * diga más de lo que sabe:
 *
 * - Que con pocos registros **no** se enseñan patrones. Una coincidencia entre
 *   tres apuntes parece una regla y no lo es.
 * - Que `igual` no se cuente ni como que ayudó ni como que no. Es lo único que
 *   se sabe de ese registro: nada.
 * - Que la intensidad se cuente y no se promedie. Un promedio la convierte en
 *   una calificación, y una calificación invita a bajarla.
 *
 * La función es pura a propósito —se ejecuta en el navegador, donde se conoce
 * la zona horaria—, así que aquí se prueba sin base de datos ni red.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  MIN_EVENTS_FOR_PATTERNS,
  summarizeSensoryPatterns,
  timeBandOf,
  type SensoryPatternInput,
} from '../lib/sensory/patterns';

/** Un registro con lo mínimo, para no repetir el objeto entero en cada caso. */
function event(
  overrides: Partial<SensoryPatternInput> = {},
): SensoryPatternInput {
  return {
    occurredAt: new Date(2026, 2, 3, 15, 0),
    domain: 'sonidos',
    intensity: 3,
    strategyUsed: null,
    outcome: null,
    ...overrides,
  };
}

describe('umbral de datos', () => {
  it('no enseña patrones por debajo del umbral', () => {
    const few = Array.from({ length: MIN_EVENTS_FOR_PATTERNS - 1 }, () =>
      event(),
    );
    assert.equal(summarizeSensoryPatterns(few).enoughData, false);
  });

  it('los enseña justo al alcanzarlo', () => {
    const enough = Array.from({ length: MIN_EVENTS_FOR_PATTERNS }, () =>
      event(),
    );
    assert.equal(summarizeSensoryPatterns(enough).enoughData, true);
  });

  it('con la bitácora vacía no se cae ni inventa', () => {
    const patterns = summarizeSensoryPatterns([]);
    assert.equal(patterns.total, 0);
    assert.equal(patterns.enoughData, false);
    assert.deepEqual(patterns.byDomain, []);
    assert.deepEqual(patterns.helped, []);
  });
});

describe('qué ayudó y qué no', () => {
  it('separa lo que mejoró de lo que empeoró', () => {
    const patterns = summarizeSensoryPatterns([
      event({ strategyUsed: 'Audífonos', outcome: 'mejoro' }),
      event({ strategyUsed: 'Audífonos', outcome: 'mejoro' }),
      event({ strategyUsed: 'Insistir', outcome: 'empeoro' }),
    ]);

    assert.deepEqual(patterns.helped, [{ label: 'Audífonos', count: 2 }]);
    assert.deepEqual(patterns.didNotHelp, [{ label: 'Insistir', count: 1 }]);
  });

  it('«se mantuvo igual» no cuenta en ninguna de las dos listas', () => {
    const patterns = summarizeSensoryPatterns([
      event({ strategyUsed: 'Salir del aula', outcome: 'igual' }),
    ]);

    assert.deepEqual(patterns.helped, []);
    assert.deepEqual(patterns.didNotHelp, []);
  });

  it('una estrategia sin resultado anotado no cuenta', () => {
    const patterns = summarizeSensoryPatterns([
      event({ strategyUsed: 'Bajar la luz', outcome: null }),
    ]);

    assert.deepEqual(patterns.helped, []);
    assert.deepEqual(patterns.didNotHelp, []);
  });

  it('los espacios sobrantes no crean dos estrategias distintas', () => {
    const patterns = summarizeSensoryPatterns([
      event({ strategyUsed: 'Audífonos', outcome: 'mejoro' }),
      event({ strategyUsed: '  Audífonos  ', outcome: 'mejoro' }),
    ]);

    assert.deepEqual(patterns.helped, [{ label: 'Audífonos', count: 2 }]);
  });

  it('una estrategia en blanco se descarta', () => {
    const patterns = summarizeSensoryPatterns([
      event({ strategyUsed: '   ', outcome: 'mejoro' }),
    ]);

    assert.deepEqual(patterns.helped, []);
  });
});

describe('intensidad', () => {
  it('se cuenta por nivel y no se promedia', () => {
    const patterns = summarizeSensoryPatterns([
      event({ intensity: 5 }),
      event({ intensity: 5 }),
      event({ intensity: 1 }),
    ]);

    assert.deepEqual(patterns.byIntensity, [
      { label: 'Intensidad 5', count: 2 },
      { label: 'Intensidad 1', count: 1 },
    ]);
  });

  it('los registros sin intensidad no aportan un cero', () => {
    const patterns = summarizeSensoryPatterns([
      event({ intensity: null }),
      event({ intensity: 2 }),
    ]);

    assert.deepEqual(patterns.byIntensity, [{ label: 'Intensidad 2', count: 1 }]);
  });
});

describe('franjas horarias', () => {
  it('reparte las horas en las cuatro franjas', () => {
    assert.equal(timeBandOf(new Date(2026, 2, 3, 2, 0)), 'madrugada');
    assert.equal(timeBandOf(new Date(2026, 2, 3, 9, 0)), 'manana');
    assert.equal(timeBandOf(new Date(2026, 2, 3, 15, 0)), 'tarde');
    assert.equal(timeBandOf(new Date(2026, 2, 3, 21, 0)), 'noche');
  });

  it('los límites caen en la franja de arriba', () => {
    assert.equal(timeBandOf(new Date(2026, 2, 3, 6, 0)), 'manana');
    assert.equal(timeBandOf(new Date(2026, 2, 3, 12, 0)), 'tarde');
    assert.equal(timeBandOf(new Date(2026, 2, 3, 19, 0)), 'noche');
    assert.equal(timeBandOf(new Date(2026, 2, 3, 0, 0)), 'madrugada');
  });

  it('agrupa por día de la semana con el nombre en español', () => {
    // 3 de marzo de 2026 es martes.
    const patterns = summarizeSensoryPatterns([
      event({ occurredAt: new Date(2026, 2, 3, 15, 0) }),
      event({ occurredAt: new Date(2026, 2, 10, 15, 0) }),
      event({ occurredAt: new Date(2026, 2, 4, 15, 0) }),
    ]);

    assert.deepEqual(patterns.byWeekday, [
      { label: 'Martes', count: 2 },
      { label: 'Miércoles', count: 1 },
    ]);
  });
});

describe('orden de los conteos', () => {
  it('ordena de más a menos, y alfabéticamente al empatar', () => {
    const patterns = summarizeSensoryPatterns([
      event({ domain: 'luces' }),
      event({ domain: 'sonidos' }),
      event({ domain: 'sonidos' }),
      event({ domain: 'olores' }),
    ]);

    const labels = patterns.byDomain.map((entry) => entry.label);
    assert.equal(labels[0], 'Sonidos');
    // Los dos que empatan a uno quedan en orden alfabético del español.
    assert.deepEqual(labels.slice(1), ['Luces', 'Olores']);
  });
});
