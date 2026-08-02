import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { db } from '../client';
import {
  resourceShares,
  sharedNotes,
  supportTeamMembers,
  type ResourceShareRow,
  type SharedNoteRow,
  type SupportTeamMemberRow,
} from '../schema/team';
import { users } from '../schema/auth';
import { assertTenantContext, type TenantContext } from '../../tenant/guard';
import {
  INVITE_TOKEN_BYTES,
  INVITE_TTL_DAYS,
  canComment,
  type Relationship,
  type ShareableType,
  type SharePermission,
} from '../../team/types';

// --- Invitaciones ------------------------------------------------------------

export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export type InviteMemberInput = {
  email: string;
  displayName?: string | null;
  relationship: Relationship;
};

export type InvitedMember = {
  member: SupportTeamMemberRow;
  /** El token en claro. Se devuelve una sola vez: en la base solo va el hash. */
  token: string;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase().slice(0, 320);
}

/**
 * Invita a alguien al equipo de apoyo.
 *
 * Invitar **no comparte nada**. Crea la relación y el token; lo que esa
 * persona podrá ver se decide después, recurso por recurso.
 *
 * Reinvitar al mismo correo renueva el token en vez de duplicar la fila. Es lo
 * que espera quien invitó hace un mes y la invitación caducó.
 */
export async function inviteMember(
  ctx: TenantContext,
  input: InviteMemberInput,
): Promise<InvitedMember> {
  assertTenantContext(ctx, 'inviteMember');

  const email = normalizeEmail(input.email);
  if (!email.includes('@')) {
    throw new Error('Ese correo no parece válido.');
  }

  const token = randomBytes(INVITE_TOKEN_BYTES).toString('base64url');
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 3600 * 1000);

  const [row] = await db
    .insert(supportTeamMembers)
    .values({
      tenantId: ctx.tenantId,
      ownerUserId: ctx.userId,
      email,
      displayName: input.displayName?.trim().slice(0, 200) || null,
      relationship: input.relationship,
      inviteTokenHash: hashInviteToken(token),
      inviteExpiresAt: expiresAt,
    })
    .onConflictDoUpdate({
      target: [
        supportTeamMembers.tenantId,
        supportTeamMembers.ownerUserId,
        supportTeamMembers.email,
      ],
      set: {
        displayName: input.displayName?.trim().slice(0, 200) || null,
        relationship: input.relationship,
        inviteTokenHash: hashInviteToken(token),
        inviteExpiresAt: expiresAt,
        invitedAt: new Date(),
        // Reinvitar a alguien cuyo acceso se retiró lo devuelve a «invitado»,
        // no a «activo»: tiene que volver a aceptar.
        status: 'invitado',
        memberUserId: null,
        acceptedAt: null,
      },
    })
    .returning();

  if (!row) throw new Error('No se pudo crear la invitación.');
  return { member: row, token };
}

export async function listTeamMembers(
  ctx: TenantContext,
): Promise<SupportTeamMemberRow[]> {
  assertTenantContext(ctx, 'listTeamMembers');

  return db
    .select()
    .from(supportTeamMembers)
    .where(
      and(
        eq(supportTeamMembers.tenantId, ctx.tenantId),
        eq(supportTeamMembers.ownerUserId, ctx.userId),
      ),
    )
    .orderBy(desc(supportTeamMembers.invitedAt));
}

export async function getTeamMember(
  ctx: TenantContext,
  memberId: string,
): Promise<SupportTeamMemberRow | null> {
  assertTenantContext(ctx, 'getTeamMember');

  const [row] = await db
    .select()
    .from(supportTeamMembers)
    .where(
      and(
        eq(supportTeamMembers.id, memberId),
        eq(supportTeamMembers.tenantId, ctx.tenantId),
        eq(supportTeamMembers.ownerUserId, ctx.userId),
      ),
    )
    .limit(1);

  return row ?? null;
}

/**
 * Acepta una invitación.
 *
 * **No lleva `TenantContext` y es deliberado.** Quien acepta viene de su propia
 * cuenta, en su propio tenant, y todavía no tiene ninguna relación con el
 * tenant de quien invitó: exigir contexto haría imposible la operación. Es la
 * segunda excepción del sistema, junto a `listMembershipsForUser`, y como
 * aquella se limita sola: solo encuentra la fila por el hash de un token que
 * únicamente conoce quien recibió el correo, y solo escribe en esa fila.
 *
 * El correo tiene que coincidir. Sin esa comprobación, un enlace reenviado a
 * un grupo de WhatsApp daría acceso a quien lo abriera primero.
 */
export async function acceptInvitation(
  token: string,
  viewer: { userId: string; email: string },
): Promise<{ ok: true; member: SupportTeamMemberRow } | { ok: false; reason: string }> {
  const hash = hashInviteToken(token);

  const [row] = await db
    .select()
    .from(supportTeamMembers)
    .where(eq(supportTeamMembers.inviteTokenHash, hash))
    .limit(1);

  if (!row) return { ok: false, reason: 'Esta invitación ya no existe.' };

  if (row.inviteExpiresAt && row.inviteExpiresAt.getTime() < Date.now()) {
    return { ok: false, reason: 'La invitación caducó. Pide que te la envíen otra vez.' };
  }

  if (row.status === 'revocado') {
    return { ok: false, reason: 'Esta invitación ya no está vigente.' };
  }

  const invited = Buffer.from(normalizeEmail(row.email));
  const actual = Buffer.from(normalizeEmail(viewer.email));
  const sameEmail =
    invited.length === actual.length && timingSafeEqual(invited, actual);

  if (!sameEmail) {
    return {
      ok: false,
      reason: 'Esta invitación es para otro correo. Entra con la cuenta a la que llegó.',
    };
  }

  const [updated] = await db
    .update(supportTeamMembers)
    .set({
      memberUserId: viewer.userId,
      status: 'activo',
      acceptedAt: new Date(),
      // El token se consume: un enlace ya usado no vuelve a servir.
      inviteTokenHash: null,
      inviteExpiresAt: null,
    })
    .where(eq(supportTeamMembers.id, row.id))
    .returning();

  if (!updated) return { ok: false, reason: 'No se pudo aceptar la invitación.' };
  return { ok: true, member: updated };
}

/**
 * Retira a alguien del equipo.
 *
 * Revoca en cascada todo lo que se le compartió, en la misma transacción. Si
 * solo se cambiara el estado, sus `resource_shares` seguirían vivos y el
 * acceso continuaría: el criterio del PRD pide corte inmediato.
 */
export async function revokeMember(
  ctx: TenantContext,
  memberId: string,
): Promise<void> {
  assertTenantContext(ctx, 'revokeMember');

  const member = await getTeamMember(ctx, memberId);
  if (!member) return;

  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .update(resourceShares)
      .set({ revokedAt: now })
      .where(
        and(
          eq(resourceShares.memberId, memberId),
          eq(resourceShares.tenantId, ctx.tenantId),
          isNull(resourceShares.revokedAt),
        ),
      );

    await tx
      .update(supportTeamMembers)
      .set({ status: 'revocado', inviteTokenHash: null, inviteExpiresAt: null })
      .where(
        and(
          eq(supportTeamMembers.id, memberId),
          eq(supportTeamMembers.tenantId, ctx.tenantId),
        ),
      );
  });
}

export async function deleteMember(
  ctx: TenantContext,
  memberId: string,
): Promise<void> {
  assertTenantContext(ctx, 'deleteMember');

  await db
    .delete(supportTeamMembers)
    .where(
      and(
        eq(supportTeamMembers.id, memberId),
        eq(supportTeamMembers.tenantId, ctx.tenantId),
        eq(supportTeamMembers.ownerUserId, ctx.userId),
      ),
    );
}

// --- Compartir ---------------------------------------------------------------

export type ShareInput = {
  memberId: string;
  resourceType: ShareableType;
  resourceId: string;
  resourceTitle: string;
  permission: SharePermission;
};

/**
 * Comparte un recurso concreto con un miembro concreto.
 *
 * Comprueba que el miembro es de quien comparte antes de escribir nada: sin
 * eso, un identificador de miembro ajeno bastaría para conceder acceso a
 * datos propios a alguien del equipo de otra persona.
 */
export async function shareResource(
  ctx: TenantContext,
  input: ShareInput,
): Promise<ResourceShareRow> {
  assertTenantContext(ctx, 'shareResource');

  const member = await getTeamMember(ctx, input.memberId);
  if (!member) throw new Error('Ese contacto no está en tu equipo de apoyo.');
  if (member.status === 'revocado') {
    throw new Error('A esa persona se le retiró el acceso. Invítala de nuevo primero.');
  }

  const [row] = await db
    .insert(resourceShares)
    .values({
      tenantId: ctx.tenantId,
      ownerUserId: ctx.userId,
      memberId: input.memberId,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      resourceTitle: input.resourceTitle.trim().slice(0, 300) || 'Sin título',
      permission: input.permission,
    })
    .onConflictDoUpdate({
      target: [
        resourceShares.memberId,
        resourceShares.resourceType,
        resourceShares.resourceId,
      ],
      set: {
        permission: input.permission,
        resourceTitle: input.resourceTitle.trim().slice(0, 300) || 'Sin título',
        // Volver a compartir algo revocado lo reactiva.
        revokedAt: null,
      },
    })
    .returning();

  if (!row) throw new Error('No se pudo compartir.');
  return row;
}

export async function revokeShare(
  ctx: TenantContext,
  shareId: string,
): Promise<void> {
  assertTenantContext(ctx, 'revokeShare');

  await db
    .update(resourceShares)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(resourceShares.id, shareId),
        eq(resourceShares.tenantId, ctx.tenantId),
        eq(resourceShares.ownerUserId, ctx.userId),
      ),
    );
}

/** Lo que esta persona ha compartido, con quién y con qué permiso. */
export async function listSharesByOwner(
  ctx: TenantContext,
): Promise<ResourceShareRow[]> {
  assertTenantContext(ctx, 'listSharesByOwner');

  return db
    .select()
    .from(resourceShares)
    .where(
      and(
        eq(resourceShares.tenantId, ctx.tenantId),
        eq(resourceShares.ownerUserId, ctx.userId),
        isNull(resourceShares.revokedAt),
      ),
    )
    .orderBy(desc(resourceShares.createdAt));
}

// --- Lado del invitado -------------------------------------------------------

/**
 * Lo que le compartieron a alguien.
 *
 * ## La excepción, explicada
 *
 * Estas funciones no reciben `TenantContext` porque el invitado **no pertenece
 * al tenant** de quien comparte: pertenece al suyo. Todo el resto del sistema
 * filtra por `ctx.tenantId`, y aquí eso no aplica.
 *
 * A cambio, la restricción es más estrecha, no más ancha: se parte siempre del
 * `viewerUserId` de la sesión —nunca de un identificador que venga de la
 * petición— y se exige, en el mismo `where`:
 *
 * - que exista una fila de `resource_shares` sin revocar,
 * - cuyo miembro sea exactamente esta persona,
 * - y cuyo miembro esté en estado activo.
 *
 * El `tenantId` del recurso sale de la fila del `share`, no de la petición. No
 * hay ningún camino por el que el invitado elija qué tenant leer.
 */
export type SharedWithMe = {
  share: ResourceShareRow;
  ownerName: string | null;
  ownerEmail: string | null;
};

export async function listSharedWithMe(
  viewerUserId: string,
): Promise<SharedWithMe[]> {
  if (!viewerUserId) return [];

  const rows = await db
    .select({
      share: resourceShares,
      ownerName: users.name,
      ownerEmail: users.email,
    })
    .from(resourceShares)
    .innerJoin(
      supportTeamMembers,
      eq(supportTeamMembers.id, resourceShares.memberId),
    )
    .innerJoin(users, eq(users.id, resourceShares.ownerUserId))
    .where(
      and(
        eq(supportTeamMembers.memberUserId, viewerUserId),
        eq(supportTeamMembers.status, 'activo'),
        isNull(resourceShares.revokedAt),
      ),
    )
    .orderBy(desc(resourceShares.createdAt));

  return rows.map((row) => ({
    share: row.share,
    ownerName: row.ownerName,
    ownerEmail: row.ownerEmail,
  }));
}

/**
 * Un recurso compartido concreto, si esta persona puede verlo ahora mismo.
 *
 * «Ahora mismo» es literal: la consulta se hace en cada lectura y exige
 * `revoked_at IS NULL`. Por eso revocar corta el acceso al instante, aunque el
 * invitado tenga la página abierta y la sesión viva.
 */
export async function getSharedResource(
  viewerUserId: string,
  shareId: string,
): Promise<SharedWithMe | null> {
  if (!viewerUserId) return null;

  const [row] = await db
    .select({
      share: resourceShares,
      ownerName: users.name,
      ownerEmail: users.email,
    })
    .from(resourceShares)
    .innerJoin(
      supportTeamMembers,
      eq(supportTeamMembers.id, resourceShares.memberId),
    )
    .innerJoin(users, eq(users.id, resourceShares.ownerUserId))
    .where(
      and(
        eq(resourceShares.id, shareId),
        eq(supportTeamMembers.memberUserId, viewerUserId),
        eq(supportTeamMembers.status, 'activo'),
        isNull(resourceShares.revokedAt),
      ),
    )
    .limit(1);

  if (!row) return null;

  return {
    share: row.share,
    ownerName: row.ownerName,
    ownerEmail: row.ownerEmail,
  };
}

// --- Notas compartidas -------------------------------------------------------

export type NoteWithAuthor = {
  note: SharedNoteRow;
  authorName: string | null;
};

export async function listSharedNotes(
  shareId: string,
  tenantId: string,
): Promise<NoteWithAuthor[]> {
  const rows = await db
    .select({ note: sharedNotes, authorName: users.name })
    .from(sharedNotes)
    .innerJoin(users, eq(users.id, sharedNotes.authorUserId))
    .where(
      and(
        eq(sharedNotes.resourceShareId, shareId),
        eq(sharedNotes.tenantId, tenantId),
      ),
    )
    .orderBy(sharedNotes.createdAt);

  return rows.map((row) => ({ note: row.note, authorName: row.authorName }));
}

/**
 * Escribe una nota sobre un recurso compartido.
 *
 * La puede escribir el dueño o el invitado, y en ambos casos se comprueba el
 * permiso contra la fila viva del `share`. Un invitado con permiso de solo
 * lectura no escribe: `canComment` decide, y decide aquí, no en la interfaz.
 */
export async function addSharedNote(
  input: {
    shareId: string;
    authorUserId: string;
    content: string;
  },
): Promise<{ ok: true; note: SharedNoteRow } | { ok: false; reason: string }> {
  const content = input.content.trim().slice(0, 4000);
  if (content.length === 0) return { ok: false, reason: 'La nota está vacía.' };

  const [row] = await db
    .select({ share: resourceShares, memberUserId: supportTeamMembers.memberUserId })
    .from(resourceShares)
    .innerJoin(
      supportTeamMembers,
      eq(supportTeamMembers.id, resourceShares.memberId),
    )
    .where(
      and(eq(resourceShares.id, input.shareId), isNull(resourceShares.revokedAt)),
    )
    .limit(1);

  if (!row) return { ok: false, reason: 'Este recurso ya no está compartido.' };

  const isOwner = row.share.ownerUserId === input.authorUserId;
  const isMember = row.memberUserId === input.authorUserId;

  if (!isOwner && !isMember) {
    return { ok: false, reason: 'No tienes acceso a este recurso.' };
  }

  if (isMember && !canComment(row.share.permission)) {
    return { ok: false, reason: 'Solo puedes leer este recurso.' };
  }

  const [note] = await db
    .insert(sharedNotes)
    .values({
      tenantId: row.share.tenantId,
      resourceShareId: input.shareId,
      authorUserId: input.authorUserId,
      content,
    })
    .returning();

  if (!note) return { ok: false, reason: 'No se pudo guardar la nota.' };
  return { ok: true, note };
}

/** Cuántas notas tiene cada recurso compartido, para la lista del dueño. */
export async function countNotesByShare(
  ctx: TenantContext,
): Promise<Map<string, number>> {
  assertTenantContext(ctx, 'countNotesByShare');

  const rows = await db
    .select({
      shareId: sharedNotes.resourceShareId,
      total: sql<number>`count(*)::int`,
    })
    .from(sharedNotes)
    .where(eq(sharedNotes.tenantId, ctx.tenantId))
    .groupBy(sharedNotes.resourceShareId);

  return new Map(rows.map((row) => [row.shareId, row.total]));
}
