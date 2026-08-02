import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getAdminContext } from '@/lib/admin/access';
import { listTenantMembersWithUsers } from '@/lib/db/repositories/tenants';
import { checkSeats, listInvitations } from '@/lib/db/repositories/memberships';
import { MembersBoard } from './members-board';

export const metadata: Metadata = { title: 'Miembros' };
export const dynamic = 'force-dynamic';

/**
 * Quién trabaja dentro de este espacio.
 *
 * Esta pantalla es la que faltaba para que el consultorio, los asientos de
 * organización y el selector de espacios sirvieran de algo: hasta ahora la
 * única forma de tener una membresía era registrarse, y eso siempre creaba un
 * espacio nuevo en lugar de entrar a uno existente.
 */
export default async function AdminMiembrosPage() {
  const admin = await getAdminContext();
  if (!admin) notFound();

  const [members, invitations, seats] = await Promise.all([
    listTenantMembersWithUsers(admin.ctx),
    listInvitations(admin.ctx),
    checkSeats(admin.ctx),
  ]);

  return (
    <MembersBoard
      currentUserId={admin.ctx.userId}
      seats={{ used: seats.used, total: seats.seats }}
      members={members.map((member) => ({
        userId: member.userId,
        name: member.name,
        email: member.email,
        role: member.role,
        status: member.status,
      }))}
      invitations={invitations.map((invitation) => ({
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        expiresAt: invitation.expiresAt.toISOString(),
      }))}
    />
  );
}
