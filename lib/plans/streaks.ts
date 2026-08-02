/**
 * Constancia de una rutina. Fase 3.
 *
 * Antes esto era la lista de fechas en que se completó, una detrás de otra.
 * Con veinte entradas eso ya no se lee: no dice si la rutina se sostiene, si se
 * dejó hace un mes o si se hace solo los días de escuela.
 *
 * ## Una racha no es una nota
 *
 * Las rachas, mal hechas, castigan. «Llevas 12 días» seguido de «perdiste tu
 * racha» convierte una herramienta de apoyo en una deuda, y a quien tiene
 * dificultad ejecutiva eso le sobra: el día que no pudo ya lo sabe.
 *
 * Por eso esta función:
 *
 * - Cuenta **días distintos**, no veces. Hacer la rutina tres veces un martes
 *   es un martes, no tres.
 * - Da **un día de margen**: la racha sigue viva si la última vez fue hoy o
 *   ayer. Sin el margen, mirar la pantalla por la mañana antes de hacerla ya
 *   diría que se rompió.
 * - Devuelve `totalDays` además de la racha, porque «56 días en total» sigue
 *   siendo verdad el día después de fallar y la racha no.
 * - No devuelve porcentajes de cumplimiento. No es un examen.
 *
 * Pura y con `today` por parámetro: se ejecuta en el navegador, que es donde se
 * sabe qué día es «hoy» para quien mira. Calculado en un servidor en UTC, una
 * rutina hecha a las nueve de la noche en Ciudad de México cae en el día
 * siguiente y rompe la racha sin motivo.
 */

/** Cuántos días atrás enseña la tira de calendario. Cuatro semanas justas. */
export const RECENT_WINDOW_DAYS = 28;

export type RecentDay = {
  /** `AAAA-MM-DD` en hora local. */
  key: string;
  date: Date;
  done: boolean;
};

export type StreakSummary = {
  /** Días distintos en que se completó, en toda la historia recibida. */
  totalDays: number;
  /** Días seguidos hasta hoy (o hasta ayer, con el día de margen). */
  currentStreak: number;
  /** La racha más larga que hubo. */
  longestStreak: number;
  /** 0 si fue hoy, 1 si fue ayer, `null` si nunca. */
  lastDoneDaysAgo: number | null;
  /** Los últimos días, del más antiguo al más reciente. */
  recentDays: RecentDay[];
};

/** El día local de una fecha, como `AAAA-MM-DD`. */
export function localDayKey(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Medianoche local del día en que cae `date`. */
function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/**
 * Días de calendario entre dos fechas.
 *
 * Se cuenta sobre medianoches locales y no dividiendo milisegundos: con cambio
 * de horario de verano un día dura 23 o 25 horas, y una división daría 0,96
 * días donde hay uno.
 */
function daysBetween(from: Date, to: Date): number {
  let count = 0;
  let cursor = startOfDay(from);
  const target = startOfDay(to);

  // El bucle avanza día a día. Las ventanas aquí son de semanas, no de años.
  while (cursor.getTime() < target.getTime() && count < 3_650) {
    cursor = addDays(cursor, 1);
    count += 1;
  }

  return count;
}

export function summarizeStreak(
  completions: Date[],
  today: Date,
): StreakSummary {
  const days = new Set(completions.map(localDayKey));

  const todayStart = startOfDay(today);

  // --- Racha actual ---------------------------------------------------------
  //
  // Se empieza en hoy si hoy está hecho, y si no en ayer: ese es el día de
  // margen. Si tampoco ayer, no hay racha viva.
  let currentStreak = 0;
  let cursor: Date | null = null;

  if (days.has(localDayKey(todayStart))) {
    cursor = todayStart;
  } else if (days.has(localDayKey(addDays(todayStart, -1)))) {
    cursor = addDays(todayStart, -1);
  }

  while (cursor && days.has(localDayKey(cursor))) {
    currentStreak += 1;
    cursor = addDays(cursor, -1);
  }

  // --- Racha más larga ------------------------------------------------------
  const sorted = [...days].sort();
  let longestStreak = 0;
  let run = 0;
  let previous: Date | null = null;

  for (const key of sorted) {
    const [year, month, day] = key.split('-').map(Number);
    const date = new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);

    run = previous && daysBetween(previous, date) === 1 ? run + 1 : 1;
    longestStreak = Math.max(longestStreak, run);
    previous = date;
  }

  // --- Última vez -----------------------------------------------------------
  let lastDoneDaysAgo: number | null = null;
  const lastKey = sorted[sorted.length - 1];

  if (lastKey) {
    const [year, month, day] = lastKey.split('-').map(Number);
    const last = new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);
    lastDoneDaysAgo = daysBetween(last, todayStart);
  }

  // --- Tira de los últimos días --------------------------------------------
  const recentDays: RecentDay[] = [];

  for (let offset = RECENT_WINDOW_DAYS - 1; offset >= 0; offset -= 1) {
    const date = addDays(todayStart, -offset);
    const key = localDayKey(date);
    recentDays.push({ key, date, done: days.has(key) });
  }

  return {
    totalDays: days.size,
    currentStreak,
    longestStreak,
    lastDoneDaysAgo,
    recentDays,
  };
}
