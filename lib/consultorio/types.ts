/**
 * Vocabulario de los consultorios virtuales. Fase 10.
 *
 * Sin dependencias: lo comparten el esquema, las tools, las pruebas y el
 * navegador.
 *
 * ## Lo que el PRD pide que quede implementado, no solo escrito
 *
 * > CIAN proporciona la **infraestructura tecnológica**. Los servicios
 * > profesionales son responsabilidad de quienes los prestan. Esto debe quedar
 * > implementado, no solo escrito.
 *
 * Eso se traduce en cosas concretas repartidas por el módulo: un profesional
 * sin verificar no puede recibir citas (no es un aviso, es una comprobación),
 * los términos se aceptan con sello de tiempo y quedan guardados, y la
 * grabación es imposible de iniciar sin el consentimiento registrado de ambas
 * partes.
 */

// --- Especialidades ----------------------------------------------------------

export const SPECIALTIES = [
  'psicologia',
  'psiquiatria',
  'neurologia',
  'terapia_ocupacional',
  'terapia_del_lenguaje',
  'nutricion',
  'educacion_especial',
  'docencia',
  'orientacion_familiar',
  'trabajo_social',
  'asesoria_en_derechos',
  'insercion_laboral',
  'vida_independiente',
  'coaching',
  'grupos_de_apoyo',
] as const;
export type Specialty = (typeof SPECIALTIES)[number];

export const SPECIALTY_LABELS: Record<Specialty, string> = {
  psicologia: 'Psicología',
  psiquiatria: 'Psiquiatría',
  neurologia: 'Neurología',
  terapia_ocupacional: 'Terapia ocupacional',
  terapia_del_lenguaje: 'Terapia del lenguaje',
  nutricion: 'Nutrición',
  educacion_especial: 'Educación especial',
  docencia: 'Docencia',
  orientacion_familiar: 'Orientación familiar',
  trabajo_social: 'Trabajo social',
  asesoria_en_derechos: 'Asesoría en derechos',
  insercion_laboral: 'Inserción laboral',
  vida_independiente: 'Vida independiente',
  coaching: 'Coaching',
  grupos_de_apoyo: 'Grupos de apoyo',
};

/**
 * Especialidades que en México exigen cédula profesional.
 *
 * No es un detalle burocrático: es la diferencia entre acompañar y ejercer una
 * profesión sanitaria. El alta lo exige donde toca y no lo inventa donde no.
 */
export const SPECIALTIES_REQUIRING_LICENSE: readonly Specialty[] = [
  'psicologia',
  'psiquiatria',
  'neurologia',
  'terapia_ocupacional',
  'terapia_del_lenguaje',
  'nutricion',
  'trabajo_social',
];

export function requiresLicense(specialties: Specialty[]): boolean {
  return specialties.some((specialty) =>
    SPECIALTIES_REQUIRING_LICENSE.includes(specialty),
  );
}

// --- Verificación ------------------------------------------------------------

export const VERIFICATION_STATUSES = [
  'pendiente',
  'verificado',
  'suspendido',
  'rechazado',
] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const VERIFICATION_STATUS_LABELS: Record<VerificationStatus, string> = {
  pendiente: 'En revisión',
  verificado: 'Verificado',
  suspendido: 'Suspendido',
  rechazado: 'No aprobado',
};

/**
 * **Solo un profesional verificado puede abrir consultorio.**
 *
 * Es una función y no una comparación suelta para que exista un único sitio
 * donde se decide, y para que la prueba pueda comprobar que ningún otro estado
 * abre la puerta —incluido cualquiera que se añada en el futuro—.
 */
export function canOpenPractice(status: VerificationStatus): boolean {
  return status === 'verificado';
}

// --- Citas -------------------------------------------------------------------

export const APPOINTMENT_STATUSES = [
  'solicitada',
  'confirmada',
  'cancelada',
  'completada',
  'no_asistio',
] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  solicitada: 'Por confirmar',
  confirmada: 'Confirmada',
  cancelada: 'Cancelada',
  completada: 'Terminada',
  no_asistio: 'No hubo asistencia',
};

/** Estados en los que se puede entrar a la sala. */
export function canJoinRoom(status: AppointmentStatus): boolean {
  return status === 'confirmada';
}

/** Cuántos minutos antes de la hora se abre la sala de espera. */
export const WAITING_ROOM_MINUTES_BEFORE = 15;

/** Cuántos minutos después de la hora sigue siendo posible entrar. */
export const JOIN_GRACE_MINUTES_AFTER = 30;

export const DEFAULT_DURATION_MINUTES = 50;

// --- Notas -------------------------------------------------------------------

/**
 * Quién ve una nota de sesión.
 *
 * `privada` es la que importa, y el criterio del PRD la nombra con mayúsculas:
 *
 * > Las notas privadas del profesional **jamás** aparecen en ninguna respuesta
 * > de API accesible al usuario — verificado con prueba explícita.
 *
 * Por eso el valor por omisión al escribir es `privada`: si alguien olvida
 * elegir, el error cae del lado de no publicar.
 */
export const NOTE_VISIBILITIES = ['privada', 'compartida'] as const;
export type NoteVisibility = (typeof NOTE_VISIBILITIES)[number];

export const NOTE_VISIBILITY_LABELS: Record<NoteVisibility, string> = {
  privada: 'Solo para ti',
  compartida: 'Visible para la persona',
};

export const NOTE_VISIBILITY_HINTS: Record<NoteVisibility, string> = {
  privada:
    'No aparece en ninguna pantalla ni respuesta que la persona pueda ver.',
  compartida: 'La persona la ve en su historial de sesiones.',
};

// --- Tareas de sesión --------------------------------------------------------

export const SESSION_TASK_STATUSES = ['pendiente', 'hecha', 'cancelada'] as const;
export type SessionTaskStatus = (typeof SESSION_TASK_STATUSES)[number];

export const SESSION_TASK_STATUS_LABELS: Record<SessionTaskStatus, string> = {
  pendiente: 'Pendiente',
  hecha: 'Hecha',
  cancelada: 'Cancelada',
};

// --- Consentimiento de grabación --------------------------------------------

/**
 * Una firma de consentimiento.
 *
 * Lleva quién, cuándo y desde qué rol. El sello de tiempo lo pone el servidor,
 * nunca el cliente: una marca de tiempo que envía el navegador no prueba nada.
 */
export type ConsentSignature = {
  userId: string;
  role: 'profesional' | 'usuario';
  /** ISO 8601, del servidor. */
  at: string;
};

export type RecordingConsent = {
  signatures: ConsentSignature[];
};

// --- Pizarra -----------------------------------------------------------------

/** Un trazo de la pizarra. Deliberadamente simple: puntos y color. */
export type WhiteboardStroke = {
  id: string;
  color: string;
  width: number;
  points: number[];
};

export type WhiteboardState = {
  strokes: WhiteboardStroke[];
};

/** Techo de trazos guardados. Más allá, el `jsonb` deja de ser razonable. */
export const MAX_WHITEBOARD_STROKES = 2000;
