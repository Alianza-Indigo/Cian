/**
 * Vocabulario del equipo de apoyo. Fase 8.
 *
 * Sin dependencias: lo comparten el esquema, las tools, las pruebas y el
 * navegador.
 *
 * La idea que ordena todo este módulo: **compartir es por recurso, nunca por
 * cuenta**. No existe «dar acceso a alguien»; existe «compartir este plan».
 * Una invitación aceptada no abre ninguna puerta por sí sola.
 */

// --- Relaciones --------------------------------------------------------------

export const RELATIONSHIPS = [
  'familiar',
  'cuidador',
  'docente',
  'terapeuta',
  'acompanante',
  'profesional',
  'otro',
] as const;
export type Relationship = (typeof RELATIONSHIPS)[number];

export const RELATIONSHIP_LABELS: Record<Relationship, string> = {
  familiar: 'Familiar',
  cuidador: 'Cuidador o cuidadora',
  docente: 'Docente',
  terapeuta: 'Terapeuta',
  acompanante: 'Acompañante',
  profesional: 'Profesional de salud',
  otro: 'Otra relación',
};

// --- Estado de la invitación -------------------------------------------------

export const MEMBER_STATUSES = ['invitado', 'activo', 'revocado'] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

export const MEMBER_STATUS_LABELS: Record<MemberStatus, string> = {
  invitado: 'Invitación enviada',
  activo: 'En el equipo',
  revocado: 'Acceso retirado',
};

// --- Qué se puede compartir --------------------------------------------------

/**
 * Los tipos de recurso que admiten compartirse.
 *
 * La bitácora de crisis **no está aquí, y es a propósito**. El PRD la usa
 * justamente como ejemplo de lo que alguien puede querer no compartir, y
 * mientras no exista una conversación explícita sobre qué significa compartir
 * el peor día de una familia, no se ofrece. Tampoco el chat: el punto 3 del
 * alcance dice «sin acceso al chat del usuario».
 */
export const SHAREABLE_TYPES = [
  'plan',
  'rutina',
  'documento',
  'material_educativo',
] as const;
export type ShareableType = (typeof SHAREABLE_TYPES)[number];

export const SHAREABLE_TYPE_LABELS: Record<ShareableType, string> = {
  plan: 'Plan de apoyo',
  rutina: 'Rutina',
  documento: 'Documento',
  material_educativo: 'Material educativo',
};

/** Ruta donde el dueño ve el recurso. La vista del invitado va por otro sitio. */
export const SHAREABLE_TYPE_PATHS: Record<ShareableType, string> = {
  plan: '/planes',
  rutina: '/rutinas',
  documento: '/documentos',
  material_educativo: '/educacion',
};

// --- Permisos ----------------------------------------------------------------

export const SHARE_PERMISSIONS = ['lectura', 'comentario'] as const;
export type SharePermission = (typeof SHARE_PERMISSIONS)[number];

export const SHARE_PERMISSION_LABELS: Record<SharePermission, string> = {
  lectura: 'Solo ver',
  comentario: 'Ver y comentar',
};

export const SHARE_PERMISSION_HINTS: Record<SharePermission, string> = {
  lectura: 'Puede abrirlo y leerlo. No puede escribir nada.',
  comentario: 'Puede leerlo y dejar notas. Nunca puede editar el original.',
};

/**
 * Nadie edita lo que no es suyo, en ningún permiso.
 *
 * No es una limitación temporal: es la decisión. Un plan de apoyo lo escribe
 * quien acompaña a la persona; un docente puede opinar sobre él, y esa opinión
 * se ve como lo que es —una nota firmada— y no como un cambio silencioso en el
 * documento de otro.
 */
export function canComment(permission: SharePermission): boolean {
  return permission === 'comentario';
}

// --- Invitaciones ------------------------------------------------------------

/** Días que vive una invitación sin aceptar. */
export const INVITE_TTL_DAYS = 14;

/** Longitud en bytes del token de invitación antes de codificarlo. */
export const INVITE_TOKEN_BYTES = 32;
