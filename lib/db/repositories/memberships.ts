import { and, count, eq, isNull, ne } from 'drizzle-orm';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { db } from '../client';
import { tenantInvitations, type TenantInvitationRow } from '../schema/invitations';
import { tenantMembers, tenants } from '../schema/tenants';
import { userPreferences } from '../schema/preferences';
import { auditLog } from '../schema/audit';
import {
  assertRoleAtLeast,
  assertTenantContext,
  type MemberRole,
  type TenantContext,
} from '../../tenant/guard';
import { getTenantPlanLimits } from './billing';

/** Días que vive una invitación sin aceptar. */
export const INVITE_TTL_DAYS = 14;

function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase().slice(0, 320);
}

// --- Miembros ----------------------------------------------------------------

// La lista con nombre y correo ya vive en `listTenantMembersWithUsers`
// (repositorio de tenants). Aquí solo se cuenta y se modifica.

/** Cuántas personas ocupan asiento ahora mismo. */
export async function countActiveMembers(ctx: TenantContext): Promise<number> {
  assertTenantContext(ctx, 'countActiveMembers');

  const [row] = await db
    .select({ total: count() })
    .from(tenantMembers)
    .where(
      and(
        eq(tenantMembers.tenantId, ctx.tenantId),
        eq(tenantMembers.status, 'active'),
      ),
    );

  return row?.total ?? 0;
}

export type SeatCheck =
  | { allowed: true; used: number; seats: number }
  | { allowed: false; message: string; used: number; seats: number };

/**
 * Si cabe una persona más.
 *
 * Cierra el pendiente de la Fase 9: los asientos estaban definidos en
 * `plan_limits`, cobrados en el checkout de Stripe y **sin aplicar en ninguna
 * parte**, porque no había ningún sitio donde se añadiera gente a un espacio.
 * Este es ese sitio.
 *
 * Las invitaciones pendientes cuentan como ocupadas. Si no contaran, se podrían
 * mandar veinte invitaciones con tres asientos y el límite se descubriría al
 * aceptar la cuarta, dejando a alguien fuera después de haberle escrito.
 */
export async function checkSeats(ctx: TenantContext): Promise<SeatCheck> {
  // Con la concesión aplicada: subirle los asientos a una escuela desde la
  // administración de plataforma tiene que notarse justo aquí.
  const { limits } = await getTenantPlanLimits(ctx);

  const [members, pending] = await Promise.all([
    countActiveMembers(ctx),
    db
      .select({ total: count() })
      .from(tenantInvitations)
      .where(
        and(
          eq(tenantInvitations.tenantId, ctx.tenantId),
          isNull(tenantInvitations.acceptedAt),
        ),
      ),
  ]);

  const used = members + (pending[0]?.total ?? 0);

  if (used < limits.asientos) {
    return { allowed: true, used, seats: limits.asientos };
  }

  return {
    allowed: false,
    used,
    seats: limits.asientos,
    message:
      `Tu plan incluye ${limits.asientos} ` +
      `${limits.asientos === 1 ? 'asiento' : 'asientos'} y ya ${
        used === 1 ? 'está ocupado' : 'están ocupados'
      }. ` +
      'Puedes retirar a alguien, cancelar una invitación pendiente o ampliar ' +
      'el plan desde Membresía.',
  };
}

/**
 * Cambia el rol de un miembro.
 *
 * **Nunca deja el espacio sin `owner`.** Un espacio sin propietario no lo puede
 * administrar nadie: no se podría invitar, ni verificar profesionales, ni
 * cancelar la suscripción. Es un estado del que no se sale sin tocar la base a
 * mano.
 */
export async function changeMemberRole(
  ctx: TenantContext,
  userId: string,
  role: MemberRole,
): Promise<void> {
  assertRoleAtLeast(ctx, 'admin', 'changeMemberRole');

  if (role !== 'owner') {
    const stillOwner = await hasAnotherOwner(ctx.tenantId, userId);
    if (!stillOwner && (await isOwner(ctx.tenantId, userId))) {
      throw new Error(
        'Es la única persona propietaria del espacio. Nombra a otra antes de cambiarle el rol.',
      );
    }
  }

  await db
    .update(tenantMembers)
    .set({ role })
    .where(
      and(
        eq(tenantMembers.tenantId, ctx.tenantId),
        eq(tenantMembers.userId, userId),
      ),
    );
}

export async function removeMember(
  ctx: TenantContext,
  userId: string,
): Promise<void> {
  assertRoleAtLeast(ctx, 'admin', 'removeMember');

  if (userId === ctx.userId) {
    throw new Error('No puedes sacarte a ti misma del espacio.');
  }

  if (
    (await isOwner(ctx.tenantId, userId)) &&
    !(await hasAnotherOwner(ctx.tenantId, userId))
  ) {
    throw new Error('Es la única persona propietaria del espacio.');
  }

  await db
    .delete(tenantMembers)
    .where(
      and(
        eq(tenantMembers.tenantId, ctx.tenantId),
        eq(tenantMembers.userId, userId),
      ),
    );
}

async function isOwner(tenantId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ role: tenantMembers.role })
    .from(tenantMembers)
    .where(
      and(eq(tenantMembers.tenantId, tenantId), eq(tenantMembers.userId, userId)),
    )
    .limit(1);

  return row?.role === 'owner';
}

async function hasAnotherOwner(
  tenantId: string,
  exceptUserId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ total: count() })
    .from(tenantMembers)
    .where(
      and(
        eq(tenantMembers.tenantId, tenantId),
        eq(tenantMembers.role, 'owner'),
        eq(tenantMembers.status, 'active'),
        ne(tenantMembers.userId, exceptUserId),
      ),
    );

  return (row?.total ?? 0) > 0;
}

// --- Invitaciones ------------------------------------------------------------

export type InvitedToTenant = {
  invitation: TenantInvitationRow;
  /** En claro y una sola vez: en la base solo va el hash. */
  token: string;
};

export async function inviteToTenant(
  ctx: TenantContext,
  input: { email: string; role: MemberRole },
): Promise<InvitedToTenant> {
  assertRoleAtLeast(ctx, 'admin', 'inviteToTenant');

  if (input.role === 'owner') {
    throw new Error(
      'La propiedad del espacio no se invita por correo: se transfiere desde dentro.',
    );
  }

  const email = normalizeEmail(input.email);
  if (!email.includes('@')) throw new Error('Ese correo no parece válido.');

  const seats = await checkSeats(ctx);
  if (!seats.allowed) throw new Error(seats.message);

  const token = randomBytes(32).toString('base64url');

  const [row] = await db
    .insert(tenantInvitations)
    .values({
      tenantId: ctx.tenantId,
      invitedByUserId: ctx.userId,
      email,
      role: input.role,
      inviteTokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 24 * 3600 * 1000),
    })
    .onConflictDoUpdate({
      target: [tenantInvitations.tenantId, tenantInvitations.email],
      set: {
        role: input.role,
        inviteTokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 24 * 3600 * 1000),
        invitedByUserId: ctx.userId,
        acceptedAt: null,
        createdAt: new Date(),
      },
    })
    .returning();

  if (!row) throw new Error('No se pudo crear la invitación.');
  return { invitation: row, token };
}

export async function listInvitations(
  ctx: TenantContext,
): Promise<TenantInvitationRow[]> {
  assertRoleAtLeast(ctx, 'admin', 'listInvitations');

  return db
    .select()
    .from(tenantInvitations)
    .where(
      and(
        eq(tenantInvitations.tenantId, ctx.tenantId),
        isNull(tenantInvitations.acceptedAt),
      ),
    )
    .orderBy(tenantInvitations.createdAt);
}

export async function cancelInvitation(
  ctx: TenantContext,
  invitationId: string,
): Promise<void> {
  assertRoleAtLeast(ctx, 'admin', 'cancelInvitation');

  await db
    .delete(tenantInvitations)
    .where(
      and(
        eq(tenantInvitations.id, invitationId),
        eq(tenantInvitations.tenantId, ctx.tenantId),
      ),
    );
}

/**
 * Acepta una invitación y entra al espacio.
 *
 * **Sin `TenantContext`, y es la tercera excepción del sistema** —junto a
 * `listMembershipsForUser` y al lado del invitado de la Fase 8—. Quien acepta
 * viene de su propia cuenta y todavía no pertenece a este espacio: exigir
 * contexto haría imposible la operación.
 *
 * Se limita sola: solo encuentra la fila por el hash de un token que únicamente
 * conoce quien recibió el correo, exige que el correo coincida, y lo único que
 * escribe es la membresía de esa persona en ese espacio.
 *
 * Los asientos se vuelven a comprobar **al aceptar**, no solo al invitar: entre
 * una cosa y otra el plan pudo bajar o pudo entrar alguien más.
 */
export async function acceptTenantInvitation(
  token: string,
  viewer: { userId: string; email: string },
): Promise<
  | { ok: true; tenantId: string; tenantName: string; role: MemberRole }
  | { ok: false; reason: string }
> {
  const [invitation] = await db
    .select()
    .from(tenantInvitations)
    .where(eq(tenantInvitations.inviteTokenHash, hashToken(token)))
    .limit(1);

  if (!invitation) return { ok: false, reason: 'Esta invitación ya no existe.' };

  if (invitation.acceptedAt) {
    return { ok: false, reason: 'Esta invitación ya se usó.' };
  }

  if (invitation.expiresAt.getTime() < Date.now()) {
    return { ok: false, reason: 'La invitación caducó. Pide que te la envíen otra vez.' };
  }

  const invited = Buffer.from(normalizeEmail(invitation.email));
  const actual = Buffer.from(normalizeEmail(viewer.email));

  if (invited.length !== actual.length || !timingSafeEqual(invited, actual)) {
    return {
      ok: false,
      reason: 'Esta invitación es para otro correo. Entra con la cuenta a la que llegó.',
    };
  }

  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, invitation.tenantId))
    .limit(1);

  if (!tenant) return { ok: false, reason: 'Ese espacio ya no existe.' };

  // Se vuelve a mirar el asiento aquí, con el contexto del espacio anfitrión.
  const hostCtx: TenantContext = {
    tenantId: invitation.tenantId,
    userId: invitation.invitedByUserId,
    role: 'admin',
  };

  const [already] = await db
    .select({ userId: tenantMembers.userId })
    .from(tenantMembers)
    .where(
      and(
        eq(tenantMembers.tenantId, invitation.tenantId),
        eq(tenantMembers.userId, viewer.userId),
      ),
    )
    .limit(1);

  if (!already) {
    const seats = await checkSeats(hostCtx);
    // La propia invitación cuenta como ocupada, así que se admite el empate.
    if (!seats.allowed && seats.used > seats.seats) {
      return { ok: false, reason: seats.message };
    }
  }

  await db.transaction(async (tx) => {
    await tx
      .insert(tenantMembers)
      .values({
        tenantId: invitation.tenantId,
        userId: viewer.userId,
        role: invitation.role,
        status: 'active',
      })
      .onConflictDoUpdate({
        target: [tenantMembers.tenantId, tenantMembers.userId],
        set: { role: invitation.role, status: 'active' },
      });

    // Preferencias propias en el espacio nuevo: densidad, tema y avisos son
    // de cada persona en cada espacio, no globales.
    await tx
      .insert(userPreferences)
      .values({ tenantId: invitation.tenantId, userId: viewer.userId })
      .onConflictDoNothing();

    await tx
      .update(tenantInvitations)
      .set({ acceptedAt: new Date() })
      .where(eq(tenantInvitations.id, invitation.id));

    await tx.insert(auditLog).values({
      tenantId: invitation.tenantId,
      userId: viewer.userId,
      action: 'tenant.member_joined',
      entity: 'tenant_member',
      entityId: viewer.userId,
      metadata: { role: invitation.role },
    });
  });

  return {
    ok: true,
    tenantId: invitation.tenantId,
    tenantName: tenant.name,
    role: invitation.role,
  };
}
