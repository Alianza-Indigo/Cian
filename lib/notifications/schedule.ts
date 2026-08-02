/**
 * Cuándo toca un recordatorio. Fase 8.
 *
 * Función pura sobre `(recordatorio, ahora)`: sin base de datos, sin red y sin
 * leer el reloj por su cuenta. El barrido del cron le pasa el instante, y las
 * pruebas también. Un módulo de horarios que llama a `Date.now()` por dentro
 * no se puede probar sin esperar a que sean las siete de la mañana.
 *
 * ## El problema real: las zonas horarias
 *
 * El cron de Vercel corre en UTC. «Las 7:00» de una familia en Ciudad de
 * México son las 13:00 UTC, y en Tijuana otra cosa. Guardar la hora sin la
 * zona produce recordatorios que llegan seis horas tarde, que es peor que no
 * llegar: quien lo recibe deja de confiar en la aplicación.
 *
 * Por eso `ReminderSchedule` lleva `timeZone` y todo lo de aquí razona en hora
 * local de cada persona, no en la del servidor.
 */
import type { QuietHours, ReminderSchedule } from './types';

export type LocalParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** 0 es domingo, como `Date.getDay()`. */
  weekday: number;
};

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/**
 * La hora de pared en una zona concreta.
 *
 * Se usa `Intl` y no aritmética de desfases porque el horario de verano no es
 * un número fijo: calcularlo a mano acierta seis meses al año.
 */
export function localPartsIn(date: Date, timeZone: string): LocalParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
  });

  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) {
    parts[part.type] = part.value;
  }

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: WEEKDAY_INDEX[parts.weekday ?? ''] ?? 0,
  };
}

/** `2026-08-03` en hora local. Sirve para saber si ya se envió hoy. */
export function localDateKey(date: Date, timeZone: string): string {
  const parts = localPartsIn(date, timeZone);
  return [
    String(parts.year).padStart(4, '0'),
    String(parts.month).padStart(2, '0'),
    String(parts.day).padStart(2, '0'),
  ].join('-');
}

/**
 * Si una hora cae dentro del silencio.
 *
 * La franja puede cruzar la medianoche —de 22:00 a 7:00 es el caso normal— y
 * ese cruce es justo el que se escribe mal cuando se compara con un simple
 * `>= inicio && < fin`.
 */
export function isQuietHour(hour: number, quiet: QuietHours): boolean {
  if (quiet.startHour === quiet.endHour) return false;

  if (quiet.startHour < quiet.endHour) {
    return hour >= quiet.startHour && hour < quiet.endHour;
  }

  return hour >= quiet.startHour || hour < quiet.endHour;
}

export type DueInput = {
  schedule: ReminderSchedule;
  active: boolean;
  lastSentAt: Date | null;
};

export type DueVerdict =
  | { due: true }
  | { due: false; reason: 'inactivo' | 'otro_dia' | 'ya_enviado' };

/**
 * Si un recordatorio entra en el resumen de hoy.
 *
 * ## Por qué no hay ventana horaria
 *
 * El cron corre una vez al día (ver `SWEEP_HOUR_UTC`). Con un solo barrido, una
 * ventana de quince minutos alrededor de la hora elegida dejaría fuera a todo
 * el mundo menos a quien la puso justo a esa hora: el 90 % de los
 * recordatorios no se enviaría nunca, en silencio.
 *
 * Así que la regla es de día, no de hora: **entra todo lo que toca hoy y no ha
 * salido hoy**. La hora elegida sigue importando —se escribe en el aviso y
 * decide el silencio— pero no controla el instante del envío, porque con un
 * cron diario eso no se puede prometer.
 *
 * El corte contra el duplicado es `lastSentAt` comparado en **hora local de la
 * persona**: si ya salió algo hoy no vuelve a salir, aunque el cron se ejecute
 * de más o se reintente un despliegue.
 */
export function isDue(input: DueInput, now: Date): DueVerdict {
  if (!input.active) return { due: false, reason: 'inactivo' };

  const { schedule } = input;
  const local = localPartsIn(now, schedule.timeZone);

  if (schedule.days.length > 0 && !schedule.days.includes(local.weekday)) {
    return { due: false, reason: 'otro_dia' };
  }

  if (
    input.lastSentAt &&
    localDateKey(input.lastSentAt, schedule.timeZone) ===
      localDateKey(now, schedule.timeZone)
  ) {
    return { due: false, reason: 'ya_enviado' };
  }

  return { due: true };
}

/** Texto legible del horario, para la interfaz y para las tools. */
export function describeSchedule(
  schedule: ReminderSchedule,
  weekdayNames: readonly string[],
): string {
  const time = `${String(schedule.hour).padStart(2, '0')}:${String(
    schedule.minute,
  ).padStart(2, '0')}`;

  if (schedule.days.length === 0) return `Todos los días a las ${time}`;

  const named = [...schedule.days]
    .sort((a, b) => a - b)
    .map((day) => weekdayNames[day] ?? '')
    .filter(Boolean);

  if (named.length === 0) return `Todos los días a las ${time}`;
  if (named.length === 1) return `Los ${named[0]} a las ${time}`;

  const last = named[named.length - 1];
  return `Los ${named.slice(0, -1).join(', ')} y ${last} a las ${time}`;
}

/** Normaliza lo que llegue del modelo o de un formulario. */
export function normalizeSchedule(
  input: Partial<ReminderSchedule> & { timeZone: string },
): ReminderSchedule {
  return {
    hour: Math.min(23, Math.max(0, Math.round(input.hour ?? 8))),
    minute: Math.min(59, Math.max(0, Math.round(input.minute ?? 0))),
    days: [
      ...new Set((input.days ?? []).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)),
    ].sort((a, b) => a - b),
    timeZone: input.timeZone,
  };
}
