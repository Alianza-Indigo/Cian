/**
 * Huecos disponibles para citar. Fase 10.
 *
 * Función pura sobre `(disponibilidad, citas ya tomadas, ahora)`: sin base de
 * datos, sin red, sin leer el reloj por dentro. Mismo criterio que en los
 * recordatorios de la Fase 8, y por la misma razón —las zonas horarias— con
 * una vuelta de tuerca:
 *
 * **aquí hay dos zonas horarias en juego**, la del profesional y la de quien
 * reserva. La disponibilidad se declara en la del profesional («atiendo los
 * martes de 9 a 14, hora de Ciudad de México») y se muestra en la de quien
 * mira. Confundirlas produce citas a las que nadie llega.
 *
 * La solución es no razonar nunca en horas sueltas: todo se convierte a
 * instantes absolutos —`Date`— lo antes posible, y las horas de pared solo
 * aparecen al pintar.
 */
import { localPartsIn } from '../notifications/schedule';

export type AvailabilityRule = {
  /** 0 es domingo, como `Date.getDay()`. */
  weekday: number;
  /** `HH:MM` en la zona del profesional. */
  startTime: string;
  endTime: string;
  timezone: string;
  active: boolean;
};

export type BusyInterval = { start: Date; end: Date };

export type Slot = { start: Date; end: Date };

/** Con cuánta antelación mínima se puede reservar. */
export const MIN_LEAD_MINUTES = 60;

/** Cuántos días hacia delante se ofrecen huecos. */
export const HORIZON_DAYS = 21;

function parseTime(value: string): { hour: number; minute: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

/**
 * El instante UTC que corresponde a una hora de pared en una zona.
 *
 * No hay API directa para esto en JavaScript, así que se estima y se corrige:
 * se parte del instante como si fuera UTC, se mira qué hora de pared da en la
 * zona pedida y se ajusta por la diferencia. Dos pasadas bastan incluso en los
 * saltos de horario de verano, donde la primera corrección puede quedarse a una
 * hora.
 */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  let guess = new Date(Date.UTC(year, month - 1, day, hour, minute));

  for (let pass = 0; pass < 2; pass += 1) {
    const parts = localPartsIn(guess, timeZone);

    const wantedMinutes = hour + minute / 60;
    const gotMinutes = parts.hour + parts.minute / 60;

    // Diferencia de día, por si la conversión cruzó la medianoche.
    const dayShift =
      Date.UTC(parts.year, parts.month - 1, parts.day) -
      Date.UTC(year, month - 1, day);

    const deltaHours = gotMinutes - wantedMinutes + dayShift / 3_600_000;
    if (Math.abs(deltaHours) < 1 / 120) break;

    guess = new Date(guess.getTime() - deltaHours * 3_600_000);
  }

  return guess;
}

function overlaps(slot: Slot, busy: BusyInterval): boolean {
  return slot.start < busy.end && busy.start < slot.end;
}

/**
 * Los huecos libres, en orden.
 *
 * Un hueco solo se ofrece si cabe entero dentro de la franja declarada: media
 * sesión no es una sesión, y ofrecerla produce una cita que se corta a la
 * mitad.
 */
export function availableSlots(input: {
  rules: AvailabilityRule[];
  busy: BusyInterval[];
  durationMinutes: number;
  now: Date;
  horizonDays?: number;
  maxSlots?: number;
}): Slot[] {
  const duration = Math.max(5, input.durationMinutes) * 60_000;
  const horizon = input.horizonDays ?? HORIZON_DAYS;
  const earliest = new Date(input.now.getTime() + MIN_LEAD_MINUTES * 60_000);

  const slots: Slot[] = [];
  const active = input.rules.filter((rule) => rule.active);

  for (let dayOffset = 0; dayOffset <= horizon; dayOffset += 1) {
    const cursor = new Date(input.now.getTime() + dayOffset * 86_400_000);

    for (const rule of active) {
      const local = localPartsIn(cursor, rule.timezone);
      if (local.weekday !== rule.weekday) continue;

      const start = parseTime(rule.startTime);
      const end = parseTime(rule.endTime);
      if (!start || !end) continue;

      const windowStart = zonedTimeToUtc(
        local.year,
        local.month,
        local.day,
        start.hour,
        start.minute,
        rule.timezone,
      );
      const windowEnd = zonedTimeToUtc(
        local.year,
        local.month,
        local.day,
        end.hour,
        end.minute,
        rule.timezone,
      );

      if (windowEnd <= windowStart) continue;

      for (
        let time = windowStart.getTime();
        time + duration <= windowEnd.getTime();
        time += duration
      ) {
        const slot = { start: new Date(time), end: new Date(time + duration) };

        if (slot.start < earliest) continue;
        if (input.busy.some((interval) => overlaps(slot, interval))) continue;

        slots.push(slot);
      }
    }
  }

  slots.sort((a, b) => a.start.getTime() - b.start.getTime());

  // Deduplica reglas solapadas del mismo profesional.
  const unique: Slot[] = [];
  for (const slot of slots) {
    if (unique.at(-1)?.start.getTime() === slot.start.getTime()) continue;
    unique.push(slot);
  }

  return unique.slice(0, input.maxSlots ?? 200);
}

/**
 * Si se puede entrar a la sala en este momento.
 *
 * La sala de espera abre antes de la hora y sigue abierta un rato después: una
 * consulta que empieza cinco minutos tarde no debe encontrar la puerta cerrada.
 */
export function joinWindow(
  scheduledAt: Date,
  now: Date,
  beforeMinutes: number,
  afterMinutes: number,
): { open: boolean; opensAt: Date; closesAt: Date } {
  const opensAt = new Date(scheduledAt.getTime() - beforeMinutes * 60_000);
  const closesAt = new Date(scheduledAt.getTime() + afterMinutes * 60_000);

  return { open: now >= opensAt && now <= closesAt, opensAt, closesAt };
}
