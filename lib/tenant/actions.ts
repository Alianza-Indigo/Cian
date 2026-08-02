'use server';

/**
 * Acciones de espacio: invitar, administrar miembros y cambiar de espacio.
 *
 * Todo pasa por el repositorio, que vuelve a comprobar rol y pertenencia. Estas
 * funciones son la puerta de la interfaz, no la cerradura: una server action se
 * puede invocar desde fuera de la pantalla que la enseña.
 */

import { revalidatePath } from 'next/cache';
import { cookies, headers } from 'next/headers';
import { z } from 'zod';
import { auth } from '../auth';
import { requireTenantContext, TENANT_COOKIE } from './context';
import {
  cancelInvitation,
  changeMemberRole,
  inviteToTenant,
  removeMember,
} from '../db/repositories/memberships';
import { findActiveMembership } from '../db/repositories/tenants';
import { recordAudit } from '../db/repositories/audit';
import { sendEmail, tenantInvitationEmail } from '../notifications/email';

export type TenantActionResult =
  | { ok: true; message?: string; inviteUrl?: string }
  | { ok: false; error: string };

const idSchema = z.uuid();

/**
 * URL pública de esta petición.
 *
 * Se prefiere la cabecera `host` a una variable de entorno por la misma razón
 * que en el equipo de apoyo: en una vista previa de Vercel el dominio no es el
 * de producción, y un enlace de invitación que apunta al sitio equivocado no se
 * puede aceptar.
 */
async function baseUrl(): Promise<string> {
  const headerList = await headers();
  const host = headerList.get('host');
  const protocol = host?.startsWith('localhost') ? 'http' : 'https';
  return host ? `${protocol}://${host}` : (process.env.AUTH_URL ?? '');
}

/**
 * Roles invitables.
 *
 * `owner` no está y no es un olvido: la propiedad del espacio se transfiere
 * desde dentro, no viaja en un enlace de correo.
 */
export const INVITABLE_ROLES = ['admin', 'professional', 'member'] as const;

export const ROLE_LABELS: Record<string, string> = {
  owner: 'Propietaria',
  admin: 'Administra',
  professional: 'Profesional',
  member: 'Integrante',
};

export const ROLE_HINTS: Record<(typeof INVITABLE_ROLES)[number], string> = {
  admin: 'Puede invitar, retirar y ver el panel del espacio.',
  professional:
    'Aparece en el consultorio y puede atender citas. No administra el espacio.',
  member: 'Usa el espacio con normalidad. No administra ni atiende citas.',
};

const inviteSchema = z.object({
  email: z.email().max(320),
  role: z.enum(INVITABLE_ROLES),
});

/**
 * Invita a alguien a trabajar dentro del espacio.
 *
 * Igual que en la Fase 8: si el correo no está configurado la invitación se
 * crea de todas formas y se devuelve el enlace para pasarlo a mano. Una
 * organización sin Resend configurado sigue pudiendo montar su equipo.
 */
export async function inviteToTenantAction(
  input: unknown,
): Promise<TenantActionResult> {
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Revisa el correo y el rol.' };
  }

  try {
    const [ctx, session] = await Promise.all([requireTenantContext(), auth()]);

    const { invitation, token } = await inviteToTenant(ctx, parsed.data);
    const inviteUrl = `${await baseUrl()}/unirme/${token}`;

    await recordAudit(ctx, {
      action: 'tenant.invite',
      entity: 'tenant_invitation',
      entityId: invitation.id,
      metadata: { role: invitation.role },
    });

    const delivery = await sendEmail(
      tenantInvitationEmail({
        to: invitation.email,
        inviterName: session?.user?.name ?? 'Alguien',
        acceptUrl: inviteUrl,
      }),
    );

    revalidatePath('/admin/miembros');

    if (delivery.ok) {
      return { ok: true, message: `Invitación enviada a ${invitation.email}.` };
    }

    return {
      ok: true,
      message: delivery.configured
        ? 'No pudimos enviar el correo. Comparte este enlace tú:'
        : 'El envío de correo no está configurado. Comparte este enlace tú:',
      inviteUrl,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'No pudimos invitar.',
    };
  }
}

export async function cancelInvitationAction(
  invitationId: string,
): Promise<TenantActionResult> {
  if (!idSchema.safeParse(invitationId).success) {
    return { ok: false, error: 'Invitación no válida.' };
  }

  try {
    const ctx = await requireTenantContext();
    await cancelInvitation(ctx, invitationId);

    await recordAudit(ctx, {
      action: 'tenant.invite_cancel',
      entity: 'tenant_invitation',
      entityId: invitationId,
    });

    revalidatePath('/admin/miembros');
    return { ok: true, message: 'Invitación cancelada. El enlace ya no sirve.' };
  } catch {
    return { ok: false, error: 'No pudimos cancelar la invitación.' };
  }
}

const roleSchema = z.object({
  userId: z.string().min(1).max(255),
  role: z.enum(['owner', 'admin', 'professional', 'member']),
});

export async function changeMemberRoleAction(
  input: unknown,
): Promise<TenantActionResult> {
  const parsed = roleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Rol no válido.' };

  try {
    const ctx = await requireTenantContext();
    await changeMemberRole(ctx, parsed.data.userId, parsed.data.role);

    await recordAudit(ctx, {
      action: 'tenant.member_role',
      entity: 'tenant_member',
      entityId: parsed.data.userId,
      metadata: { role: parsed.data.role },
    });

    revalidatePath('/admin/miembros');
    return { ok: true, message: 'Rol actualizado.' };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : 'No pudimos cambiar el rol.',
    };
  }
}

export async function removeMemberAction(
  userId: string,
): Promise<TenantActionResult> {
  if (typeof userId !== 'string' || userId.trim().length === 0) {
    return { ok: false, error: 'Persona no válida.' };
  }

  try {
    const ctx = await requireTenantContext();
    await removeMember(ctx, userId);

    await recordAudit(ctx, {
      action: 'tenant.member_removed',
      entity: 'tenant_member',
      entityId: userId,
    });

    revalidatePath('/admin/miembros');
    return {
      ok: true,
      message: 'Ya no forma parte del espacio. Sus datos propios no se borran.',
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'No pudimos retirarle.',
    };
  }
}

/**
 * Cambia el espacio activo.
 *
 * La cookie **se comprueba antes de escribirse**. `getTenantContext` ya ignora
 * una cookie que apunte a un espacio ajeno, así que técnicamente sobra; se hace
 * igual para que el fallo se vea aquí, con un mensaje, en vez de dejar a la
 * persona en un espacio que no es el que eligió sin explicación ninguna.
 */
export async function switchTenantAction(
  tenantId: string,
): Promise<TenantActionResult> {
  if (!idSchema.safeParse(tenantId).success) {
    return { ok: false, error: 'Espacio no válido.' };
  }

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: 'Necesitas iniciar sesión.' };

  const membership = await findActiveMembership(tenantId, userId);
  if (!membership) {
    return { ok: false, error: 'No perteneces a ese espacio.' };
  }

  const cookieStore = await cookies();
  cookieStore.set(TENANT_COOKIE, tenantId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });

  // Todo lo que se vea después depende del espacio: no basta con revalidar una
  // ruta suelta.
  revalidatePath('/', 'layout');
  return { ok: true, message: `Estás en ${membership.tenant.name}.` };
}
