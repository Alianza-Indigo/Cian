/**
 * Vista de patrones de la bitácora. Punto 7 del alcance de la Fase 7.
 *
 * Es una función pura sobre los episodios ya leídos: sin base de datos, sin
 * `Date.now()` escondido, sin red. Eso permite probarla y —lo que importa
 * más— ejecutarla en el navegador, donde sí se conoce la zona horaria de quien
 * mira. Calcular «le pasa más al salir de la escuela» en un servidor que vive
 * en UTC produce una franja horaria equivocada por varias horas, y ese dato
 * equivocado es peor que no darlo.
 *
 * Lo que no hace: interpretar. Cuenta y ordena. Decir «esto se debe a…» sería
 * cruzar la línea que el barandal médico protege.
 */
import type { CrisisAction, CrisisOutcome, CrisisSeverity } from './types';

export type PatternInput = {
  occurredAt: Date;
  severity: CrisisSeverity;
  triggers: string[];
  actionsTaken: CrisisAction[];
  outcome: CrisisOutcome | null;
  escalated: boolean;
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

export type CrisisPatterns = {
  total: number;
  escalations: number;
  /** Disparadores más repetidos, de mayor a menor. */
  triggers: Tally[];
  /** Lo que sirvió, de más veces a menos. */
  helped: Tally[];
  /** Lo que se intentó y no sirvió. Vale tanto como lo anterior. */
  didNotHelp: Tally[];
  bySeverity: Tally[];
  byOutcome: Tally[];
  byTimeBand: Tally[];
  byWeekday: Tally[];
  /** Cuántos episodios hacen falta para que los patrones signifiquen algo. */
  enoughData: boolean;
};

/**
 * Umbral por debajo del cual no se muestran patrones.
 *
 * Con tres episodios cualquier coincidencia parece una regla. Mostrar «el
 * 100 % de las crisis pasan los martes» cuando hay dos crisis no informa:
 * confunde, y en este módulo confundir tiene costo.
 */
export const MIN_EPISODES_FOR_PATTERNS = 4;

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

export function summarizeCrisisPatterns(
  episodes: PatternInput[],
): CrisisPatterns {
  const helped: string[] = [];
  const didNotHelp: string[] = [];

  for (const episode of episodes) {
    for (const entry of episode.actionsTaken) {
      if (entry.helped === true) helped.push(entry.action);
      else if (entry.helped === false) didNotHelp.push(entry.action);
    }
  }

  return {
    total: episodes.length,
    escalations: episodes.filter((episode) => episode.escalated).length,
    triggers: tally(episodes.flatMap((episode) => episode.triggers)),
    helped: tally(helped),
    didNotHelp: tally(didNotHelp),
    bySeverity: tally(episodes.map((episode) => episode.severity)),
    byOutcome: tally(
      episodes
        .map((episode) => episode.outcome)
        .filter((outcome): outcome is CrisisOutcome => outcome !== null),
    ),
    byTimeBand: tally(episodes.map((episode) => timeBandOf(episode.occurredAt))),
    byWeekday: tally(
      episodes.map((episode) => String(episode.occurredAt.getDay())),
    ),
    enoughData: episodes.length >= MIN_EPISODES_FOR_PATTERNS,
  };
}
