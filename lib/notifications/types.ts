/**
 * Vocabulario de recordatorios y notificaciones. Fase 8.
 *
 * Sin dependencias, como el resto de módulos de tipos.
 *
 * Una advertencia que atraviesa todo el módulo: esto es una plataforma para
 * personas neurodivergentes, y muchas viven las notificaciones como una fuente
 * de ansiedad más. Por eso los silencios no son una opción avanzada escondida
 * en un menú, sino parte del modelo de datos; por eso no hay recordatorios
 * repetidos ni insistentes; y por eso el valor por omisión de todo es
 * «apagado».
 */

// --- Qué se recuerda ---------------------------------------------------------

export const REMINDER_KINDS = ['rutina', 'tarea', 'plan', 'libre'] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];

export const REMINDER_KIND_LABELS: Record<ReminderKind, string> = {
  rutina: 'Rutina',
  tarea: 'Tarea',
  plan: 'Plan',
  libre: 'Recordatorio suelto',
};

// --- Por dónde llega ---------------------------------------------------------

export const CHANNELS = ['push', 'correo'] as const;
export type Channel = (typeof CHANNELS)[number];

export const CHANNEL_LABELS: Record<Channel, string> = {
  push: 'Notificación en el dispositivo',
  correo: 'Correo electrónico',
};

// --- Cómo terminó el envío ---------------------------------------------------

export const DELIVERY_STATUSES = ['enviado', 'fallido', 'omitido'] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  enviado: 'Entregado',
  fallido: 'Falló',
  omitido: 'No se envió',
};

// --- Horario -----------------------------------------------------------------

/**
 * Cuándo suena un recordatorio.
 *
 * Deliberadamente pobre: hora del día y días de la semana. Sin repeticiones
 * cada N minutos, sin «insistir hasta que confirmes», sin escaladas. Un
 * recordatorio que insiste no ayuda a nadie a arrancar una rutina; entrena a
 * ignorar la aplicación.
 *
 * `days` usa la convención de `Date.getDay()`: 0 es domingo. Vacío significa
 * todos los días.
 */
export type ReminderSchedule = {
  /** Hora local de la persona, 0 a 23. */
  hour: number;
  /** Minuto, 0 a 59. */
  minute: number;
  /** Días de la semana. Vacío = todos. */
  days: number[];
  /** Zona horaria IANA. Sin esto, «las 7 de la mañana» no significa nada. */
  timeZone: string;
};

export const DEFAULT_TIME_ZONE = 'America/Mexico_City';

export const WEEKDAY_SHORT = ['D', 'L', 'M', 'X', 'J', 'V', 'S'] as const;
export const WEEKDAY_NAMES = [
  'domingo',
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
] as const;

// --- Silencios ---------------------------------------------------------------

/**
 * Franja en la que no llega nada.
 *
 * Puede cruzar la medianoche (22:00 a 7:00), que es el caso normal. Cuando
 * `start` y `end` son iguales, no hay silencio.
 */
export type QuietHours = {
  startHour: number;
  endHour: number;
};

export const DEFAULT_QUIET_HOURS: QuietHours = { startHour: 22, endHour: 7 };

/**
 * Cada cuánto barre el cron. Define también la ventana de tolerancia: un
 * recordatorio de las 7:00 se despacha en el barrido que cae entre 7:00 y
 * 7:15, nunca dos veces.
 */
export const SWEEP_MINUTES = 15;

// --- Preferencias de aviso ---------------------------------------------------

/**
 * Lo que la persona configuró. Vive en `user_preferences.notifications`.
 *
 * Sin canales encendidos por omisión: nadie recibe notificaciones que no pidió.
 */
export type NotificationPreferences = {
  channels: Channel[];
  quietHours: QuietHours;
  timeZone: string;
};

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  channels: [],
  quietHours: DEFAULT_QUIET_HOURS,
  timeZone: DEFAULT_TIME_ZONE,
};
