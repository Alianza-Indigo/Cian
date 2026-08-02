/**
 * Vocabulario de la biblioteca y del módulo educativo.
 */

export const LIBRARY_CATEGORIES = [
  'neurodivergencia',
  'educacion',
  'comunicacion',
  'inclusion',
  'derechos',
  'accesibilidad',
  'estrategias',
  'vida_diaria',
  'familias',
] as const;
export type LibraryCategory = (typeof LIBRARY_CATEGORIES)[number];

export const LIBRARY_CATEGORY_LABELS: Record<LibraryCategory, string> = {
  neurodivergencia: 'Neurodivergencia',
  educacion: 'Educación',
  comunicacion: 'Comunicación',
  inclusion: 'Inclusión',
  derechos: 'Derechos',
  accesibilidad: 'Accesibilidad',
  estrategias: 'Estrategias prácticas',
  vida_diaria: 'Vida diaria',
  familias: 'Recursos para familias',
};

/**
 * Dimensión de los vectores.
 *
 * El PRD fija 1536. `gemini-embedding-001` permite configurar la dimensión de
 * salida, así que se conserva ese número tal cual: no hubo que desviarse del
 * documento por el cambio de proveedor.
 *
 * Cambiar este número obliga a reindexar toda la biblioteca y a migrar la
 * columna: no es un ajuste, es una operación.
 */
export const EMBEDDING_DIMENSIONS = 1536;

export const EMBEDDING_MODEL_ID = 'gemini-embedding-001';

// --- Educación --------------------------------------------------------------

export const EDUCATION_KINDS = [
  'adaptacion',
  'agenda_visual',
  'reunion_escolar',
  'apoyo_de_clase',
] as const;
export type EducationKind = (typeof EDUCATION_KINDS)[number];

export const EDUCATION_KIND_LABELS: Record<EducationKind, string> = {
  adaptacion: 'Adaptación educativa',
  agenda_visual: 'Agenda visual',
  reunion_escolar: 'Reunión escolar',
  apoyo_de_clase: 'Apoyo de clase',
};

export const EDUCATION_KIND_HINTS: Record<EducationKind, string> = {
  adaptacion:
    'Ajustes concretos al entorno, a los materiales o a la evaluación para que una persona pueda participar.',
  agenda_visual:
    'Secuencia de la jornada o de una actividad, en pasos breves pensados para imprimirse.',
  reunion_escolar:
    'Guion para una reunión con la escuela: qué plantear, en qué orden y con qué respaldo.',
  apoyo_de_clase:
    'Material para docentes sobre un contenido concreto, con los principios del Diseño Universal para el Aprendizaje.',
};

/** Los tres principios del DUA, que estructuran las adaptaciones. */
export const UDL_PRINCIPLES = [
  'representacion',
  'accion_expresion',
  'implicacion',
] as const;
export type UdlPrinciple = (typeof UDL_PRINCIPLES)[number];

export const UDL_PRINCIPLE_LABELS: Record<UdlPrinciple, string> = {
  representacion: 'Formas de presentar la información',
  accion_expresion: 'Formas de actuar y expresarse',
  implicacion: 'Formas de implicarse y sostener el interés',
};

export type EducationPayload = {
  summary?: string;
  /** Adaptaciones por principio del DUA. */
  udl?: Partial<Record<UdlPrinciple, string[]>>;
  /** Pasos de una agenda visual. */
  steps?: Array<{ title: string; icon?: string; note?: string }>;
  /** Puntos a plantear en una reunión. */
  talkingPoints?: Array<{ point: string; support?: string }>;
  /** Preguntas que conviene hacer. */
  questions?: string[];
  /** Recursos de la biblioteca en los que se apoyó. */
  citations?: Array<{ slug: string; title: string }>;
};

export function isEducationKind(value: unknown): value is EducationKind {
  return EDUCATION_KINDS.includes(value as EducationKind);
}
