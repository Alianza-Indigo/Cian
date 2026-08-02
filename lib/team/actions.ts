'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { z } from 'zod';
import { auth } from '../auth';
import { requireTenantContext } from '../tenant/context';
import {
  addSharedNote,
  deleteMember,
  inviteMember,
  revokeMember,
  revokeShare,
  shareResource,
} from '../db/repositories/team';
import { recordAudit } from '../db/repositories/audit';
import { invitationEmail, sendEmail } from '../notifications/email';
import { enforceLimit } from '../billing/enforce';
import { RELATIONSHIPS, SHAREABLE_TYPES, SHARE_PERMISSIONS } from './types';

export type TeamActionResult =
  | { ok: true; message?: string; inviteUrl?: string }
  | { ok: false; error: string };

const idSchema = z.uuid();

/**
 * La URL pública de la aplicación.
 *
 * Se prefiere la cabecera `host` de la petición en curso a una variable de
 * entorno: en Vercel el dominio de una vista previa no coincide con el de
 * producción, y un enlace de invitación que apunta al sitio equivocado no se
 * puede aceptar.
 */
async function baseUrl(): Promise<string> {
  const headerList = await headers();
  const host = headerList.get('host');
  const protocol = host?.startsWith('localhost') ? 'http' : 'https';
  return host ? `${protocol}://${host}` : (process.env.AUTH_URL ?? '');
}

const inviteSchema = z.object({
  email: z.email().max(320),
  displayName: z.string().max(200).optional(),
  relationship: z.enum(RELATIONSHIPS),
});

/**
 * Invita a alguien al equipo de apoyo.
 *
 * Si el correo no está configurado, la invitación **se crea igual** y se
 * devuelve el enlace para compartirlo a mano. Es peor experiencia, pero deja
 * a la persona con algo que hacer en vez de un error sin salida.
 */
export async function inviteMemberAction(
  input: unknown,
): Promise<TeamActionResult> {
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Revisa el correo y la relación.' };
  }

  try {
    const [ctx, session] = await Promise.all([requireTenantContext(), auth()]);

    // El límite es de personas en el equipo, no de invitaciones enviadas:
    // reinvitar a alguien que ya está no debe contar como una plaza nueva.
    const quota = await enforceLimit(ctx, 'equipo_de_apoyo');
    if (!quota.allowed) return { ok: false, error: quota.message };

    const { member, token } = await inviteMember(ctx, parsed.data);
    const inviteUrl = `${await baseUrl()}/invitacion/${token}`;

    await recordAudit(ctx, {
      action: 'team.invite',
      entity: 'support_team_member',
      entityId: member.id,
      metadata: { relationship: member.relationship },
    });

    const delivery = await sendEmail(
      invitationEmail({
        to: member.email,
        inviterName: session?.user?.name ?? 'Alguien',
        acceptUrl: inviteUrl,
      }),
    );

    revalidatePath('/equipo');

    if (delivery.ok) {
      return { ok: true, message: `Invitación enviada a ${member.email}.` };
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

export async function revokeMemberAction(
  memberId: string,
): Promise<TeamActionResult> {
  if (!idSchema.safeParse(memberId).success) {
    return { ok: false, error: 'Contacto no válido.' };
  }

  try {
    const ctx = await requireTenantContext();
    await revokeMember(ctx, memberId);

    await recordAudit(ctx, {
      action: 'team.revoke_member',
      entity: 'support_team_member',
      entityId: memberId,
    });

    revalidatePath('/equipo');
    return { ok: true, message: 'Acceso retirado. Ya no ve nada.' };
  } catch {
    return { ok: false, error: 'No pudimos retirar el acceso.' };
  }
}

export async function deleteMemberAction(
  memberId: string,
): Promise<TeamActionResult> {
  if (!idSchema.safeParse(memberId).success) {
    return { ok: false, error: 'Contacto no válido.' };
  }

  try {
    const ctx = await requireTenantContext();
    await deleteMember(ctx, memberId);
    revalidatePath('/equipo');
    return { ok: true, message: 'Contacto eliminado del equipo.' };
  } catch {
    return { ok: false, error: 'No pudimos eliminarlo.' };
  }
}

const shareSchema = z.object({
  memberId: z.uuid(),
  resourceType: z.enum(SHAREABLE_TYPES),
  resourceId: z.uuid(),
  resourceTitle: z.string().min(1).max(300),
  permission: z.enum(SHARE_PERMISSIONS),
});

export async function shareResourceAction(
  input: unknown,
): Promise<TeamActionResult> {
  const parsed = shareSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'No pudimos identificar qué compartir.' };
  }

  try {
    const ctx = await requireTenantContext();
    const share = await shareResource(ctx, parsed.data);

    await recordAudit(ctx, {
      action: 'share.grant',
      entity: share.resourceType,
      entityId: share.resourceId,
      metadata: { permission: share.permission, memberId: share.memberId },
    });

    revalidatePath('/equipo');
    return { ok: true, message: 'Compartido.' };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'No pudimos compartir.',
    };
  }
}

export async function revokeShareAction(
  shareId: string,
): Promise<TeamActionResult> {
  if (!idSchema.safeParse(shareId).success) {
    return { ok: false, error: 'No válido.' };
  }

  try {
    const ctx = await requireTenantContext();
    await revokeShare(ctx, shareId);

    await recordAudit(ctx, {
      action: 'share.revoke',
      entity: 'resource_share',
      entityId: shareId,
    });

    revalidatePath('/equipo');
    return { ok: true, message: 'Ya no está compartido.' };
  } catch {
    return { ok: false, error: 'No pudimos dejar de compartirlo.' };
  }
}

/**
 * Deja una nota sobre un recurso compartido.
 *
 * La escribe tanto el dueño como el invitado, y el permiso se comprueba en el
 * repositorio contra la fila viva del `share`. Por eso esta acción **no** pide
 * `TenantContext`: el invitado no tiene ninguno en el tenant del dueño.
 */
export async function addSharedNoteAction(
  shareId: string,
  content: string,
): Promise<TeamActionResult> {
  if (!idSchema.safeParse(shareId).success) {
    return { ok: false, error: 'Recurso no válido.' };
  }

  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: 'Necesitas iniciar sesión.' };
  }

  const result = await addSharedNote({
    shareId,
    authorUserId: session.user.id,
    content,
  });

  if (!result.ok) return { ok: false, error: result.reason };

  revalidatePath(`/compartido/${shareId}`);
  revalidatePath('/equipo');
  return { ok: true, message: 'Nota guardada.' };
}
