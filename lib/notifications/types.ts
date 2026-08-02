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

// --- El barrido diario -------------------------------------------------------

/**
 * Hora UTC a la que corre el cron. Debe coincidir con `vercel.json`.
 *
 * ## Por qué una vez al día, y qué significa eso
 *
 * El cron corre **una sola vez cada 24 horas**. Eso cambia lo que CIAN puede
 * prometer, y conviene decirlo sin adornos: un recordatorio no suena a la hora
 * que la persona eligió, sino en el barrido.
 *
 * De ahí que los avisos sean un **resumen del día**: en el barrido sale todo lo
 * que toca hoy, con su hora escrita en el mensaje. «Rutina de la mañana — a las
 * 07:00» es útil como agenda aunque llegue a las 7:00 en punto y no a las 7:00
 * de la tarde.
 *
 * Las 13:00 UTC son las 7:00 en Ciudad de México, que es donde vive casi toda
 * la gente que usa CIAN. Así el resumen llega al empezar el día y los
 * recordatorios matutinos —los más comunes— caen prácticamente puntuales.
 *
 * Si algún día el proyecto sube a un plan con cron más frecuentes, lo que hay
 * que cambiar es esta constante, `vercel.json` y volver a meter una ventana en
 * `isDue`. Mientras tanto, la aplicación dice la verdad sobre lo que hace.
 */
export const SWEEP_HOUR_UTC = 13;

/** Texto para la interfaz. Que nadie tenga que deducirlo del código. */
export const SWEEP_DESCRIPTION =
  'Los avisos salen una vez al día, alrededor de las 7:00 de la mañana (hora ' +
  'del centro de México), como un resumen de lo que toca hoy. La hora que ' +
  'elijas aparece en el aviso, pero no suena a esa hora exacta.';

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
