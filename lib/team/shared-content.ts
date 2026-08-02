/**
 * Lectura de un recurso compartido, para la vista del invitado.
 *
 * ## Por qué existe este archivo aparte
 *
 * Todo el resto del acceso a datos filtra por `TenantContext`, y el invitado
 * no tiene ninguno en el tenant de quien comparte: pertenece al suyo. Si se
 * intentara reutilizar los repositorios normales habría que inventarle un
 * contexto falso, y ese es justo el atajo que acaba filtrando datos entre
 * tenants.
 *
 * En vez de eso, aquí las lecturas toman el `tenantId` **de la fila del
 * `share`**, que ya fue verificada por `getSharedResource`. La cadena es:
 *
 *   sesión → `member_user_id` activo → `resource_share` sin revocar → tenantId
 *
 * En ningún punto el invitado elige el tenant ni el recurso; solo elige un
 * `shareId`, y ese se comprueba contra su propia identidad antes de llegar
 * aquí. Todas las funciones son de solo lectura.
 *
 * La forma devuelta es intencionalmente pobre —títulos y textos— y no las
 * filas completas: el invitado no necesita identificadores internos ni fechas
 * de sistema, y lo que no se manda no se puede filtrar.
 */
import { and, asc, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { plans, planObjectives, planStrategies } from '../db/schema/plans';
import { routines, routineSteps } from '../db/schema/routines';
import { documents } from '../db/schema/documents';
import { educationItems } from '../db/schema/library';
import type { ShareableType } from './types';

export type SharedSection = {
  heading: string;
  items: string[];
};

export type SharedContent = {
  title: string;
  description: string | null;
  sections: SharedSection[];
  /** Solo para documentos: la ruta de descarga con permiso comprobado. */
  downloadId: string | null;
};

async function readPlan(
  tenantId: string,
  planId: string,
): Promise<SharedContent | null> {
  const [plan] = await db
    .select()
    .from(plans)
    .where(and(eq(plans.id, planId), eq(plans.tenantId, tenantId)))
    .limit(1);

  if (!plan) return null;

  const objectives = await db
    .select()
    .from(planObjectives)
    .where(
      and(
        eq(planObjectives.planId, plan.id),
        eq(planObjectives.tenantId, tenantId),
      ),
    )
    .orderBy(asc(planObjectives.orderIndex));

  const sections: SharedSection[] = [];

  for (const objective of objectives) {
    const strategies = await db
      .select()
      .from(planStrategies)
      .where(
        and(
          eq(planStrategies.objectiveId, objective.id),
          eq(planStrategies.tenantId, tenantId),
        ),
      )
      .orderBy(asc(planStrategies.orderIndex));

    sections.push({
      heading: objective.title,
      items: strategies.map((strategy) => strategy.content),
    });
  }

  return {
    title: plan.title,
    description: plan.description,
    sections,
    downloadId: null,
  };
}

async function readRoutine(
  tenantId: string,
  routineId: string,
): Promise<SharedContent | null> {
  const [routine] = await db
    .select()
    .from(routines)
    .where(and(eq(routines.id, routineId), eq(routines.tenantId, tenantId)))
    .limit(1);

  if (!routine) return null;

  const steps = await db
    .select()
    .from(routineSteps)
    .where(
      and(
        eq(routineSteps.routineId, routine.id),
        eq(routineSteps.tenantId, tenantId),
      ),
    )
    .orderBy(asc(routineSteps.orderIndex));

  return {
    title: routine.title,
    description: routine.description,
    sections: [
      {
        heading: 'Pasos',
        items: steps.map((step) =>
          step.note ? `${step.title} — ${step.note}` : step.title,
        ),
      },
    ],
    downloadId: null,
  };
}

async function readDocument(
  tenantId: string,
  documentId: string,
): Promise<SharedContent | null> {
  const [document] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.tenantId, tenantId)))
    .limit(1);

  if (!document) return null;

  return {
    title: document.title,
    description: document.status === 'ready' ? null : 'Todavía se está generando.',
    sections: [],
    downloadId: document.status === 'ready' ? document.id : null,
  };
}

async function readEducationItem(
  tenantId: string,
  itemId: string,
): Promise<SharedContent | null> {
  const [item] = await db
    .select()
    .from(educationItems)
    .where(
      and(eq(educationItems.id, itemId), eq(educationItems.tenantId, tenantId)),
    )
    .limit(1);

  if (!item) return null;

  const sections: SharedSection[] = [];

  if (item.payload.steps?.length) {
    sections.push({
      heading: 'Pasos',
      items: item.payload.steps.map((step) => step.title),
    });
  }

  if (item.payload.talkingPoints?.length) {
    sections.push({
      heading: 'Puntos a plantear',
      items: item.payload.talkingPoints.map((point) => point.point),
    });
  }

  if (item.payload.questions?.length) {
    sections.push({
      heading: 'Preguntas',
      items: item.payload.questions,
    });
  }

  return {
    title: item.title,
    description: item.payload.summary ?? null,
    sections,
    downloadId: item.documentId,
  };
}

export async function readSharedContent(
  tenantId: string,
  resourceType: ShareableType,
  resourceId: string,
): Promise<SharedContent | null> {
  switch (resourceType) {
    case 'plan':
      return readPlan(tenantId, resourceId);
    case 'rutina':
      return readRoutine(tenantId, resourceId);
    case 'documento':
      return readDocument(tenantId, resourceId);
    case 'material_educativo':
      return readEducationItem(tenantId, resourceId);
  }
}
