import type { Metadata } from 'next';
import { requireTenantContext } from '@/lib/tenant/context';
import {
  countNotesByShare,
  listSharesByOwner,
  listTeamMembers,
} from '@/lib/db/repositories/team';
import { listPlans } from '@/lib/db/repositories/plans';
import { listRoutines } from '@/lib/db/repositories/routines';
import { listDocuments } from '@/lib/db/repositories/documents';
import { listEducationItems } from '@/lib/db/repositories/education';
import { TeamBoard, type ShareableItem } from './team-board';

export const metadata: Metadata = { title: 'Equipo de apoyo' };
export const dynamic = 'force-dynamic';

export default async function EquipoPage() {
  const ctx = await requireTenantContext();

  const [members, shares, noteCounts, plans, routines, documents, education] =
    await Promise.all([
      listTeamMembers(ctx),
      listSharesByOwner(ctx),
      countNotesByShare(ctx),
      listPlans(ctx),
      listRoutines(ctx),
      listDocuments(ctx),
      listEducationItems(ctx),
    ]);

  const shareable: ShareableItem[] = [
    ...plans.map((plan) => ({
      type: 'plan' as const,
      id: plan.id,
      title: plan.title,
    })),
    ...routines.map((routine) => ({
      type: 'rutina' as const,
      id: routine.id,
      title: routine.title,
    })),
    ...documents.map((document) => ({
      type: 'documento' as const,
      id: document.id,
      title: document.title,
    })),
    ...education.map((item) => ({
      type: 'material_educativo' as const,
      id: item.id,
      title: item.title,
    })),
  ];

  return (
    <div style={{ display: 'grid', gap: 'var(--cian-section-gap)' }}>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Equipo de apoyo</h1>
        <p className="mt-2 text-muted-foreground">
          Familiares, docentes, terapeutas y quien acompañe. Estar en el equipo
          no les da acceso a nada: solo ven lo que compartes, recurso por
          recurso, y dejan de verlo en cuanto lo retiras.
        </p>
      </div>

      <TeamBoard
        members={members.map((member) => ({
          id: member.id,
          email: member.email,
          displayName: member.displayName,
          relationship: member.relationship,
          status: member.status,
          acceptedAt: member.acceptedAt?.toISOString() ?? null,
        }))}
        shares={shares.map((share) => ({
          id: share.id,
          memberId: share.memberId,
          resourceType: share.resourceType,
          resourceId: share.resourceId,
          resourceTitle: share.resourceTitle,
          permission: share.permission,
          notes: noteCounts.get(share.id) ?? 0,
        }))}
        shareable={shareable}
      />
    </div>
  );
}
