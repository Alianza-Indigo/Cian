/**
 * Vocabulario sensorial y de funciones ejecutivas.
 */

// --- Sensorialidad ----------------------------------------------------------

export const SENSORY_DOMAINS = [
  'sonidos',
  'luces',
  'texturas',
  'temperatura',
  'olores',
  'interocepcion',
  'propiocepcion',
] as const;
export type SensoryDomain = (typeof SENSORY_DOMAINS)[number];

export const SENSORY_DOMAIN_LABELS: Record<SensoryDomain, string> = {
  sonidos: 'Sonidos',
  luces: 'Luces',
  texturas: 'Texturas',
  temperatura: 'Temperatura',
  olores: 'Olores',
  interocepcion: 'Señales del cuerpo',
  propiocepcion: 'Cuerpo y movimiento',
};

export const SENSORY_DOMAIN_HINTS: Record<SensoryDomain, string> = {
  sonidos: 'Ruido, volumen, sonidos repentinos o constantes.',
  luces: 'Intensidad, parpadeo, luz natural o artificial.',
  texturas: 'Ropa, alimentos, superficies, etiquetas, costuras.',
  temperatura: 'Frío, calor, cambios bruscos.',
  olores: 'Perfumes, comida, productos de limpieza.',
  interocepcion:
    'Percibir hambre, sed, ganas de ir al baño, cansancio o dolor desde dentro.',
  propiocepcion:
    'Saber dónde está el cuerpo en el espacio; presión, equilibrio, movimiento.',
};

/**
 * Sensibilidad por dominio. No es una escala clínica: describe cómo se vive.
 * `hiposensible` significa que se busca más estímulo, no que se perciba menos
 * de lo «correcto».
 */
export const SENSITIVITY_LEVELS = [
  'hipersensible',
  'sensible',
  'sin_dificultad',
  'hiposensible',
  'variable',
] as const;
export type SensitivityLevel = (typeof SENSITIVITY_LEVELS)[number];

export const SENSITIVITY_LABELS: Record<SensitivityLevel, string> = {
  hipersensible: 'Le afecta mucho',
  sensible: 'Le afecta a veces',
  sin_dificultad: 'Sin dificultad',
  hiposensible: 'Busca más estímulo',
  variable: 'Cambia según el día',
};

/** Del 1 al 5. Es cómo se vivió el momento, no una medición. */
export const INTENSITY_MIN = 1;
export const INTENSITY_MAX = 5;

export const EVENT_OUTCOMES = ['mejoro', 'igual', 'empeoro'] as const;
export type EventOutcome = (typeof EVENT_OUTCOMES)[number];

export const EVENT_OUTCOME_LABELS: Record<EventOutcome, string> = {
  mejoro: 'Mejoró',
  igual: 'Se mantuvo igual',
  empeoro: 'Empeoró',
};

// --- Funciones ejecutivas ---------------------------------------------------

export const TASK_STATUSES = ['pendiente', 'en_progreso', 'hecha'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  pendiente: 'Pendiente',
  en_progreso: 'En progreso',
  hecha: 'Hecha',
};

export const TASK_PRIORITIES = ['baja', 'media', 'alta'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  baja: 'Puede esperar',
  media: 'Importante',
  alta: 'Urgente',
};

/**
 * Tope de subtareas al descomponer.
 *
 * El criterio de aceptación pide que «no puedo empezar a limpiar» devuelva un
 * primer paso mínimo, **no una lista de diez cosas**. Una lista larga ante una
 * dificultad de inicio es más parálisis, no menos.
 */
export const MAX_SUBTASKS = 6;
