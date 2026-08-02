/**
 * Vocabulario de planes y rutinas.
 *
 * Sin dependencias, como el resto de módulos de tipos: lo comparten el
 * esquema, las tools y el navegador.
 */

// --- Planes de apoyo --------------------------------------------------------

export const PLAN_TYPES = [
  'personalizado',
  'familiar',
  'escolar',
  'autonomia',
  'seguimiento',
] as const;
export type PlanType = (typeof PLAN_TYPES)[number];

export const PLAN_TYPE_LABELS: Record<PlanType, string> = {
  personalizado: 'Personalizado',
  familiar: 'Familiar',
  escolar: 'Escolar',
  autonomia: 'De autonomía',
  seguimiento: 'De seguimiento',
};

export const PLAN_TYPE_HINTS: Record<PlanType, string> = {
  personalizado: 'Para una persona en concreto, sin encajar en las otras categorías.',
  familiar: 'Acuerdos y estrategias que involucran a toda la familia.',
  escolar: 'Apoyos y adaptaciones para el entorno escolar.',
  autonomia: 'Desarrollo de habilidades para la vida independiente.',
  seguimiento: 'Observación de una situación a lo largo del tiempo.',
};

export const PLAN_STATUSES = ['activo', 'pausado', 'terminado'] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

export const PLAN_STATUS_LABELS: Record<PlanStatus, string> = {
  activo: 'Activo',
  pausado: 'En pausa',
  terminado: 'Terminado',
};

export const OBJECTIVE_STATUSES = ['pendiente', 'en_progreso', 'logrado'] as const;
export type ObjectiveStatus = (typeof OBJECTIVE_STATUSES)[number];

export const OBJECTIVE_STATUS_LABELS: Record<ObjectiveStatus, string> = {
  pendiente: 'Pendiente',
  en_progreso: 'En progreso',
  logrado: 'Logrado',
};

// --- Rutinas ----------------------------------------------------------------

export const ROUTINE_TYPES = [
  'matutina',
  'nocturna',
  'escolar',
  'laboral',
  'sensorial',
  'descanso',
  'alimentacion',
] as const;
export type RoutineType = (typeof ROUTINE_TYPES)[number];

export const ROUTINE_TYPE_LABELS: Record<RoutineType, string> = {
  matutina: 'Matutina',
  nocturna: 'Nocturna',
  escolar: 'Escolar',
  laboral: 'Laboral',
  sensorial: 'Sensorial',
  descanso: 'De descanso',
  alimentacion: 'De alimentación',
};

export const ROUTINE_TYPE_HINTS: Record<RoutineType, string> = {
  matutina: 'Lo que ocurre al despertar, hasta salir de casa.',
  nocturna: 'La secuencia para cerrar el día y preparar el descanso.',
  escolar: 'La jornada escolar o los momentos de transición alrededor de ella.',
  laboral: 'La jornada de trabajo y sus transiciones.',
  sensorial: 'Secuencia de regulación ante sobrecarga o para prevenirla.',
  descanso: 'Pausas y momentos de recuperación durante el día.',
  alimentacion: 'La organización alrededor de una comida.',
};

/**
 * Duración de un paso. Se acota a algo razonable para una secuencia visual:
 * más de una hora en un solo paso significa que hace falta partirlo.
 */
export const STEP_DURATION_MIN_SECONDS = 0;
export const STEP_DURATION_MAX_SECONDS = 3600;

export function isPlanType(value: unknown): value is PlanType {
  return PLAN_TYPES.includes(value as PlanType);
}

export function isRoutineType(value: unknown): value is RoutineType {
  return ROUTINE_TYPES.includes(value as RoutineType);
}

/** «5 min», «1 h 30 min», «45 s». Pensado para leerse de un vistazo. */
export function formatDuration(seconds: number | null): string | null {
  if (seconds === null || seconds <= 0) return null;

  if (seconds < 60) return `${seconds} s`;

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/** Duración total de una secuencia de pasos. */
export function totalDuration(
  steps: Array<{ durationSeconds: number | null }>,
): number {
  return steps.reduce((total, step) => total + (step.durationSeconds ?? 0), 0);
}
