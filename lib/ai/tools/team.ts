import { tool } from 'ai';
import { z } from 'zod';
import {
  listSharesByOwner,
  listTeamMembers,
  revokeShare,
  shareResource,
} from '../../db/repositories/team';
import { listPlans } from '../../db/repositories/plans';
import { listRoutines } from '../../db/repositories/routines';
import { listDocuments } from '../../db/repositories/documents';
import { listEducationItems } from '../../db/repositories/education';
import { recordAudit } from '../../db/repositories/audit';
import {
  MEMBER_STATUS_LABELS,
  RELATIONSHIP_LABELS,
  SHAREABLE_TYPES,
  SHAREABLE_TYPE_LABELS,
  SHARE_PERMISSIONS,
  SHARE_PERMISSION_LABELS,
} from '../../team/types';
import type { ToolContext, ToolRegistry } from './index';

/**
 * Tools del equipo de apoyo. Fase 8.
 *
 * Criterio del PRD: «"quiero compartir este plan con mi esposa" genera una
 * invitación y comparte solo ese plan».
 *
 * Dos decisiones sobre lo que el modelo **no** puede hacer:
 *
 * 1. **No invita.** Invitar manda un correo a una persona real y crea un
 *    enlace de acceso; que eso salga de una frase mal entendida en una
 *    conversación es un riesgo que no compensa. El modelo lista el equipo y
 *    dice dónde invitar. Compartir con alguien que ya está sí lo hace.
 * 2. **No elige a quién.** Recibe el nombre o el correo y busca la
 *    coincidencia; si hay más de una, no adivina y pregunta. Compartir con la
 *    persona equivocada no tiene deshacer que sirva: ya lo vio.
 */
export function buildTeamTools({ ctx }: ToolContext): ToolRegistry {
  return {
    listSupportTeam: tool({
      description:
        'Quién está en el equipo de apoyo de esta persona y qué se le ha ' +
        'compartido. Úsalo antes de compartir algo, para saber con quién se ' +
        'puede y con quién no.',
      inputSchema: z.object({}),
      async execute() {
        const [members, shares] = await Promise.all([
          listTeamMembers(ctx),
          listSharesByOwner(ctx),
        ]);

        return {
          equipo: members.map((member) => ({
            id: member.id,
            nombre: member.displayName ?? member.email,
            correo: member.email,
            relacion: RELATIONSHIP_LABELS[member.relationship],
            estado: MEMBER_STATUS_LABELS[member.status],
            puedeRecibirCosas: member.status === 'activo',
          })),
          compartido: shares.map((share) => ({
            shareId: share.id,
            miembroId: share.memberId,
            recurso: share.resourceTitle,
            tipo: SHAREABLE_TYPE_LABELS[share.resourceType],
            permiso: SHARE_PERMISSION_LABELS[share.permission],
          })),
          comoInvitar:
            'Para invitar a alguien nuevo, dile que abra Equipo de apoyo en el ' +
            'menú. Tú no puedes enviar invitaciones.',
        };
      },
    }),

    listShareableResources: tool({
      description:
        'Qué se puede compartir: planes, rutinas, documentos y materiales ' +
        'educativos. Úsalo para encontrar el identificador del recurso que la ' +
        'persona nombró en la conversación.',
      inputSchema: z.object({
        type: z.enum(SHAREABLE_TYPES).optional(),
      }),
      async execute({ type }) {
        const [plans, routines, documents, education] = await Promise.all([
          !type || type === 'plan' ? listPlans(ctx) : Promise.resolve([]),
          !type || type === 'rutina' ? listRoutines(ctx) : Promise.resolve([]),
          !type || type === 'documento' ? listDocuments(ctx) : Promise.resolve([]),
          !type || type === 'material_educativo'
            ? listEducationItems(ctx)
            : Promise.resolve([]),
        ]);

        return {
          recursos: [
            ...plans.map((plan) => ({
              tipo: 'plan',
              id: plan.id,
              titulo: plan.title,
            })),
            ...routines.map((routine) => ({
              tipo: 'rutina',
              id: routine.id,
              titulo: routine.title,
            })),
            ...documents.map((document) => ({
              tipo: 'documento',
              id: document.id,
              titulo: document.title,
            })),
            ...education.map((item) => ({
              tipo: 'material_educativo',
              id: item.id,
              titulo: item.title,
            })),
          ],
        };
      },
    }),

    shareResourceWithMember: tool({
      description:
        'Comparte UN recurso concreto con UNA persona del equipo de apoyo. ' +
        'Ejemplo: ante «quiero compartir este plan con mi esposa», busca a esa ' +
        'persona con listSupportTeam, encuentra el plan con ' +
        'listShareableResources y comparte solo eso.\n\n' +
        'Si hay más de una persona que encaje con el nombre, NO elijas: ' +
        'pregunta cuál. Compartir con quien no era no se puede deshacer.\n\n' +
        `Permisos: ${SHARE_PERMISSIONS.map(
          (permission) => `${permission} (${SHARE_PERMISSION_LABELS[permission]})`,
        ).join(', ')}.`,
      inputSchema: z.object({
        memberId: z.string().describe('El id que devolvió listSupportTeam.'),
        resourceType: z.enum(SHAREABLE_TYPES),
        resourceId: z.string(),
        resourceTitle: z.string().min(1).max(300),
        permission: z.enum(SHARE_PERMISSIONS).default('lectura'),
      }),
      async execute({ memberId, resourceType, resourceId, resourceTitle, permission }) {
        const share = await shareResource(ctx, {
          memberId,
          resourceType,
          resourceId,
          resourceTitle,
          permission,
        });

        await recordAudit(ctx, {
          action: 'share.grant',
          entity: resourceType,
          entityId: resourceId,
          metadata: { permission, memberId, via: 'chat' },
        });

        return {
          compartido: true,
          shareId: share.id,
          recurso: share.resourceTitle,
          permiso: SHARE_PERMISSION_LABELS[share.permission],
        };
      },
    }),

    stopSharing: tool({
      description:
        'Deja de compartir un recurso. El efecto es inmediato: quien lo tenía ' +
        'abierto deja de verlo al recargar.',
      inputSchema: z.object({
        shareId: z.string().describe('El shareId que devolvió listSupportTeam.'),
      }),
      async execute({ shareId }) {
        await revokeShare(ctx, shareId);

        await recordAudit(ctx, {
          action: 'share.revoke',
          entity: 'resource_share',
          entityId: shareId,
          metadata: { via: 'chat' },
        });

        return { revocado: true };
      },
    }),
  };
}
