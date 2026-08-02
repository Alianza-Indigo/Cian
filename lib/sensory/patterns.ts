/**
 * Vista de patrones de la bitácora sensorial. Fase 5.
 *
 * El PRD pedía «registro de eventos y vista de patrones» y la vista de patrones
 * no se había construido: la bitácora era una lista de fichas por orden de
 * fecha, que sirve para recordar un día concreto y no para ver que el ruido
 * siempre pasa factura al salir de la escuela.
 *
 * Pura, igual que `lib/crisis/patterns.ts` y por el mismo motivo: se ejecuta en
 * el navegador, donde sí se conoce la zona horaria de quien mira. «Le pasa más
 * por la tarde» calculado en un servidor que vive en UTC sale con varias horas
 * de error, y un dato así es peor que no darlo.
 *
 * Lo que no hace: interpretar, ni promediar. La intensidad del 1 al 5 es cómo
 * se vivió algo, no una medición; sacarle una media la convertiría en una
 * métrica y en algo que se puede «mejorar». Se cuenta cuántas veces se vivió
 * cada nivel y ya.
 */
import {
  EVENT_OUTCOME_LABELS,
  SENSORY_DOMAIN_LABELS,
  type EventOutcome,
  type SensoryDomain,
} from './types';

export type SensoryPatternInput = {
  occurredAt: Date;
  domain: SensoryDomain;
  intensity: number | null;
  strategyUsed: string | null;
  outcome: EventOutcome | null;
};

export type Tally = { label: string; count: number };

export const TIME_BANDS = ['madrugada', 'manana', 'tarde', 'noche'] as const;
export type TimeBand = (typeof TIME_BANDS)[number];

export const TIME_BAND_LABELS: Record<TimeBand, string> = {
  madrugada: 'Madrugada (0 a 6)',
  manana: 'Mañana (6 a 12)',
  tarde: 'Tarde (12 a 19)',
  noche: 'Noche (19 a 24)',
};

export const WEEKDAY_LABELS = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
] as const;

export type SensoryPatterns = {
  total: number;
  byDomain: Tally[];
  byOutcome: Tally[];
  byIntensity: Tally[];
  byTimeBand: Tally[];
  byWeekday: Tally[];
  /** Estrategias tras las que la cosa mejoró, de más veces a menos. */
  helped: Tally[];
  /** Estrategias tras las que empeoró. Vale tanto como lo anterior. */
  didNotHelp: Tally[];
  enoughData: boolean;
};

/**
 * Cuántos registros hacen falta para enseñar patrones.
 *
 * El mismo umbral que en crisis y por lo mismo: con tres registros cualquier
 * coincidencia parece una regla, y «el 100 % te pasa los martes» cuando hay dos
 * martes no informa, confunde.
 */
export const MIN_EVENTS_FOR_PATTERNS = 5;

function tally(values: string[]): Tally[] {
  const counts = new Map<string, number>();

  for (const value of values) {
    const key = value.trim();
    if (key.length === 0) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'es'));
}

export function timeBandOf(date: Date): TimeBand {
  const hour = date.getHours();
  if (hour < 6) return 'madrugada';
  if (hour < 12) return 'manana';
  if (hour < 19) return 'tarde';
  return 'noche';
}

export function summarizeSensoryPatterns(
  events: SensoryPatternInput[],
): SensoryPatterns {
  const helped: string[] = [];
  const didNotHelp: string[] = [];

  for (const event of events) {
    const strategy = event.strategyUsed?.trim();
    if (!strategy) continue;
    if (event.outcome === 'mejoro') helped.push(strategy);
    else if (event.outcome === 'empeoro') didNotHelp.push(strategy);
    // `igual` no cuenta ni a favor ni en contra: no sirvió y tampoco estorbó,
    // y meterlo en cualquiera de las dos listas diría algo que no se sabe.
  }

  return {
    total: events.length,
    byDomain: tally(
      events.map((event) => SENSORY_DOMAIN_LABELS[event.domain] ?? event.domain),
    ),
    byOutcome: tally(
      events
        .map((event) => event.outcome)
        .filter((outcome): outcome is EventOutcome => outcome !== null)
        .map((outcome) => EVENT_OUTCOME_LABELS[outcome]),
    ),
    byIntensity: tally(
      events
        .map((event) => event.intensity)
        .filter((intensity): intensity is number => typeof intensity === 'number')
        .map((intensity) => `Intensidad ${intensity}`),
    ),
    byTimeBand: tally(
      events.map((event) => TIME_BAND_LABELS[timeBandOf(event.occurredAt)]),
    ),
    byWeekday: tally(
      events.map(
        (event) => WEEKDAY_LABELS[event.occurredAt.getDay()] ?? 'Sin día',
      ),
    ),
    helped: tally(helped),
    didNotHelp: tally(didNotHelp),
    enoughData: events.length >= MIN_EVENTS_FOR_PATTERNS,
  };
}
