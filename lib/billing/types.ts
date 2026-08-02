/**
 * Planes y límites. Fase 9.
 *
 * Sin dependencias: lo comparten el esquema, las tools, las pruebas y el
 * navegador.
 *
 * ## La decisión que ordena este archivo
 *
 * El PRD pide un **plan gratuito con límites, para que nadie quede fuera por
 * costo**. Eso no es una nota al pie: condiciona qué se limita y cómo.
 *
 * Lo que se limita es el **costo variable** —mensajes al modelo, documentos
 * generados, almacenamiento— y nunca la seguridad ni el acompañamiento. En
 * concreto: la escalera de derivación de crisis no consume cuota y no se
 * bloquea nunca, por ningún motivo, en ningún plan. Cobrar por el momento en
 * que alguien pide ayuda sería indefendible.
 */

export const PLANS = ['free', 'personal', 'organization'] as const;
export type Plan = (typeof PLANS)[number];

export const PLAN_LABELS: Record<Plan, string> = {
  free: 'Gratuito',
  personal: 'Personal',
  organization: 'Organización',
};

export const PLAN_DESCRIPTIONS: Record<Plan, string> = {
  free: 'Para empezar y quedarse. Con límites, pero completo.',
  personal: 'Para una familia que usa CIAN todos los días.',
  organization: 'Para asociaciones, escuelas y equipos con varias personas.',
};

// --- Ciclo de cobro ----------------------------------------------------------

export const BILLING_CYCLES = ['mensual', 'anual'] as const;
export type BillingCycle = (typeof BILLING_CYCLES)[number];

export const BILLING_CYCLE_LABELS: Record<BillingCycle, string> = {
  mensual: 'Mensual',
  anual: 'Anual',
};

// --- Estado de la suscripción ------------------------------------------------

/**
 * Los estados que a CIAN le importan, no todos los de Stripe.
 *
 * Stripe distingue `incomplete`, `incomplete_expired`, `unpaid`, `paused` y
 * varios más. Aquí se colapsan a cinco, porque lo único que decide la
 * aplicación es si hay acceso de pago o no, y si hay que avisar de algo.
 */
export const SUBSCRIPTION_STATUSES = [
  'activa',
  'periodo_de_prueba',
  'pago_pendiente',
  'cancelada',
  'incompleta',
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  activa: 'Activa',
  periodo_de_prueba: 'En periodo de prueba',
  pago_pendiente: 'Pago pendiente',
  cancelada: 'Cancelada',
  incompleta: 'Sin completar',
};

/** Estados en los que el plan de pago sigue dando acceso. */
export function grantsAccess(status: SubscriptionStatus): boolean {
  // `pago_pendiente` cuenta a propósito: Stripe reintenta el cobro durante
  // días, y cortar el acceso al primer fallo deja sin herramientas a una
  // familia por una tarjeta vencida.
  return (
    status === 'activa' ||
    status === 'periodo_de_prueba' ||
    status === 'pago_pendiente'
  );
}

// --- Qué se limita -----------------------------------------------------------

export const LIMITED_RESOURCES = [
  'mensajes',
  'documentos',
  'almacenamiento',
  'equipo_de_apoyo',
] as const;
export type LimitedResource = (typeof LIMITED_RESOURCES)[number];

export const LIMITED_RESOURCE_LABELS: Record<LimitedResource, string> = {
  mensajes: 'Mensajes al mes',
  documentos: 'Documentos al mes',
  almacenamiento: 'Almacenamiento',
  equipo_de_apoyo: 'Personas en el equipo de apoyo',
};

/** `null` significa sin límite. */
export type PlanLimits = {
  mensajes: number | null;
  documentos: number | null;
  almacenamiento: number | null;
  equipo_de_apoyo: number | null;
  /** Cuántas personas caben en el tenant. Las organizaciones lo amplían. */
  asientos: number;
};

const MB = 1024 * 1024;

/**
 * Los límites por omisión, en código.
 *
 * La tabla `plan_limits` puede sobrescribirlos sin redeploy, pero estos
 * existen para que la aplicación funcione con la base recién creada y para que
 * un error de configuración no deje a nadie sin límites... ni sin servicio.
 *
 * El plan gratuito es generoso a propósito. Un límite que se alcanza la
 * primera semana no es un plan gratuito: es una demostración.
 */
export const DEFAULT_PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: {
    mensajes: 200,
    documentos: 10,
    almacenamiento: 200 * MB,
    equipo_de_apoyo: 3,
    asientos: 1,
  },
  personal: {
    mensajes: 3000,
    documentos: 100,
    almacenamiento: 2048 * MB,
    equipo_de_apoyo: 20,
    asientos: 1,
  },
  organization: {
    mensajes: null,
    documentos: null,
    almacenamiento: 20480 * MB,
    equipo_de_apoyo: null,
    asientos: 5,
  },
};

/** Tamaño legible, para la interfaz. */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * MB) return `${Math.round(bytes / (1024 * MB))} GB`;
  if (bytes >= MB) return `${Math.round(bytes / MB)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

// --- Modelos por tenant ------------------------------------------------------

/**
 * Para qué se usa cada modelo configurado.
 *
 * `crisis` está separado a propósito. La Fase 7 dejó anotado que si el modelo
 * económico no sostiene los barandales del módulo de crisis, la salida no es
 * relajar el barandal sino usar un modelo más capaz **solo ahí**. Esto es lo
 * que lo hace posible sin tocar código.
 */
export const MODEL_PURPOSES = ['chat', 'utilidad', 'crisis', 'embeddings'] as const;
export type ModelPurpose = (typeof MODEL_PURPOSES)[number];

export const MODEL_PURPOSE_LABELS: Record<ModelPurpose, string> = {
  chat: 'Conversación',
  utilidad: 'Tareas cortas (títulos, resúmenes)',
  crisis: 'Módulo de crisis',
  embeddings: 'Búsqueda en la biblioteca',
};

export const MODEL_PURPOSE_HINTS: Record<ModelPurpose, string> = {
  chat: 'El modelo que responde en las conversaciones.',
  utilidad: 'Para lo barato y frecuente. Conviene el modelo más económico.',
  crisis:
    'Si el modelo de conversación no sostiene los barandales de crisis, ' +
    'aquí se pone uno más capaz sin encarecer todo lo demás.',
  embeddings: 'Cambiarlo obliga a reindexar la biblioteca entera.',
};
