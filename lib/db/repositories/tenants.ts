import { and, eq } from 'drizzle-orm';
import { db } from '../client';
import {
  tenantMembers,
  tenants,
  type TenantRow,
  type MemberRole,
} from '../schema/tenants';
import { users } from '../schema/auth';
import {
  assertRoleAtLeast,
  assertTenantContext,
  type TenantContext,
} from '../../tenant/guard';

export type MembershipWithTenant = {
  tenant: TenantRow;
  role: MemberRole;
};

/**
 * Membresias activas de una persona. Es la unica funcion del repositorio que
 * NO recibe `TenantContext`: se usa justamente para descubrir a que tenants
 * pertenece alguien, antes de que exista un contexto. Por eso filtra siempre
 * por `userId` y por estado activo, y no acepta ningun otro criterio.
 */
export async function listMembershipsForUser(
  userId: string,
): Promise<MembershipWithTenant[]> {
  if (typeof userId !== 'string' || userId.trim().length === 0) {
    throw new Error('listMembershipsForUser: se requiere userId.');
  }

  const rows = await db
    .select({ tenant: tenants, role: tenantMembers.role })
    .from(tenantMembers)
    .innerJoin(tenants, eq(tenants.id, tenantMembers.tenantId))
    .where(
      and(eq(tenantMembers.userId, userId), eq(tenantMembers.status, 'active')),
    );

  return rows;
}

/**
 * Verifica que la persona pertenezca al tenant y devuelve su rol.
 * Devuelve `null` si no hay membresia activa: quien llama debe tratar eso
 * como "no existe", nunca como "sin permiso pero visible".
 */
export async function findActiveMembership(
  tenantId: string,
  userId: string,
): Promise<MembershipWithTenant | null> {
  if (!tenantId || !userId) return null;

  const [row] = await db
    .select({ tenant: tenants, role: tenantMembers.role })
    .from(tenantMembers)
    .innerJoin(tenants, eq(tenants.id, tenantMembers.tenantId))
    .where(
      and(
        eq(tenantMembers.tenantId, tenantId),
        eq(tenantMembers.userId, userId),
        eq(tenantMembers.status, 'active'),
      ),
    )
    .limit(1);

  return row ?? null;
}

/** El tenant del contexto actual. */
export async function getCurrentTenant(
  ctx: TenantContext,
): Promise<TenantRow | null> {
  assertTenantContext(ctx, 'getCurrentTenant');

  const [row] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, ctx.tenantId))
    .limit(1);

  return row ?? null;
}

export async function listTenantMembers(ctx: TenantContext) {
  assertTenantContext(ctx, 'listTenantMembers');

  return db
    .select()
    .from(tenantMembers)
    .where(eq(tenantMembers.tenantId, ctx.tenantId));
}

/** Renombrar el tenant. Solo `admin` u `owner`. */
export async function renameTenant(
  ctx: TenantContext,
  name: string,
): Promise<TenantRow> {
  assertRoleAtLeast(ctx, 'admin', 'renameTenant');

  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new Error('El nombre del espacio no puede quedar vacio.');
  }

  const [row] = await db
    .update(tenants)
    .set({ name: trimmed })
    .where(eq(tenants.id, ctx.tenantId))
    .returning();

  if (!row) {
    throw new Error('No se encontro el espacio a renombrar.');
  }

  return row;
}

/**
 * Los miembros del espacio con su nombre y correo, para el panel.
 *
 * `listTenantMembers` devuelve solo la fila de membresía porque el resto del
 * sistema no necesita saber quién es quién. El panel sí: una lista de
 * identificadores no le sirve a nadie para administrar un equipo.
 */
export async function listTenantMembersWithUsers(
  ctx: TenantContext,
): Promise<
  Array<{
    userId: string;
    name: string | null;
    email: string | null;
    role: MemberRole;
    status: string;
    createdAt: Date;
  }>
> {
  assertRoleAtLeast(ctx, 'admin', 'listTenantMembersWithUsers');

  const rows = await db
    .select({
      userId: tenantMembers.userId,
      name: users.name,
      email: users.email,
      role: tenantMembers.role,
      status: tenantMembers.status,
      createdAt: tenantMembers.createdAt,
    })
    .from(tenantMembers)
    .innerJoin(users, eq(users.id, tenantMembers.userId))
    .where(eq(tenantMembers.tenantId, ctx.tenantId))
    .orderBy(tenantMembers.createdAt);

  return rows;
}
