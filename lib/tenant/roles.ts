/**
 * Roles de un espacio: qué se puede invitar y cómo se llama cada cosa.
 *
 * Vive **fuera** de `./actions`, y no es una manía de organización: un archivo
 * con `'use server'` solo puede exportar funciones asíncronas. Exportar de ahí
 * una constante rompe el módulo entero **en tiempo de ejecución**, no al
 * compilar, y se lleva por delante todas las server actions que compartan
 * paquete con él —incluida la de cerrar sesión, que no tiene nada que ver—.
 *
 * `next build` no lo detecta. Si alguna vez hay que devolver una constante a
 * `actions.ts`, es aquí donde conviene leer por qué no.
 */
import type { MemberRole } from './guard';

/**
 * Roles invitables por correo.
 *
 * `owner` no está y no es un olvido: la propiedad del espacio se transfiere
 * desde dentro, viendo a quién se le da. Una invitación que la concede es
 * demasiado poder viajando en un enlace.
 */
export const INVITABLE_ROLES = ['admin', 'professional', 'member'] as const;

export type InvitableRole = (typeof INVITABLE_ROLES)[number];

export const ROLE_LABELS: Record<MemberRole, string> = {
  owner: 'Propietaria',
  admin: 'Administra',
  professional: 'Profesional',
  member: 'Integrante',
};

export const ROLE_HINTS: Record<InvitableRole, string> = {
  admin: 'Puede invitar, retirar y ver el panel del espacio.',
  professional:
    'Aparece en el consultorio y puede atender citas. No administra el espacio.',
  member: 'Usa el espacio con normalidad. No administra ni atiende citas.',
};
