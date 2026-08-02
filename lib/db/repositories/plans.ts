import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { db } from '../client';
import {
  planObjectives,
  planProgress,
  planStrategies,
  plans,
  type PlanObjectiveRow,
  type PlanProgressRow,
  type PlanRow,
  type PlanStrategyRow,
} from '../schema/plans';
import { assertTenantContext, type TenantContext } from '../../tenant/guard';
import type {
  ObjectiveStatus,
  PlanStatus,
  PlanType,
} from '../../plans/types';

/** Un plan con todo lo que cuelga de él, listo para pintar o exportar. */
export type FullPlan = PlanRow & {
  objectives: Array<
    PlanObjectiveRow & { strategies: PlanStrategyRow[] }
  >;
};

export type CreatePlanInput = {
  type: PlanType;
  title: string;
  description?: string | null;
  conversationId?: string | null;
  objectives?: Array<{
    title: string;
    description?: string | null;
    strategies?: string[];
  }>;
};

/**
 * Crea el plan completo en una transacción.
 *
 * Un plan a medias —con objetivos pero sin estrategias, o al revés— es peor
 * que ninguno: la persona lo abre, lo ve incompleto y no sabe si fue un error
 * o si así se generó.
 */
export async function createPlan(
  ctx: TenantContext,
  input: CreatePlanInput,
): Promise<FullPlan> {
  assertTenantContext(ctx, 'createPlan');

  const title = input.title.trim().slice(0, 200);
  if (title.length === 0) {
    throw new Error('El plan necesita un título.');
  }

  const planId = await db.transaction(async (tx) => {
    const [plan] = await tx
      .insert(plans)
      .values({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        conversationId: input.conversationId ?? null,
        type: input.type,
        title,
        description: input.description?.trim() || null,
      })
      .returning();

    if (!plan) throw new Error('No se pudo crear el plan.');

    for (const [index, objective] of (input.objectives ?? []).entries()) {
      const objectiveTitle = objective.title.trim().slice(0, 300);
      if (objectiveTitle.length === 0) continue;

      const [row] = await tx
        .insert(planObjectives)
        .values({
          tenantId: ctx.tenantId,
          planId: plan.id,
          title: objectiveTitle,
          description: objective.description?.trim() || null,
          orderIndex: index,
        })
        .returning();

      if (!row) continue;

      const strategies = (objective.strategies ?? [])
        .map((content) => content.trim())
        .filter((content) => content.length > 0);

      if (strategies.length > 0) {
        await tx.insert(planStrategies).values(
          strategies.map((content, strategyIndex) => ({
            tenantId: ctx.tenantId,
            objectiveId: row.id,
            content: content.slice(0, 1000),
            orderIndex: strategyIndex,
          })),
        );
      }
    }

    return plan.id;
  });

  const created = await getPlan(ctx, planId);
  if (!created) throw new Error('No se pudo leer el plan recién creado.');
  return created;
}

export async function getPlan(
  ctx: TenantContext,
  planId: string,
): Promise<FullPlan | null> {
  assertTenantContext(ctx, 'getPlan');

  const [plan] = await db
    .select()
    .from(plans)
    .where(
      and(
        eq(plans.id, planId),
        eq(plans.tenantId, ctx.tenantId),
        eq(plans.userId, ctx.userId),
      ),
    )
    .limit(1);

  if (!plan) return null;

  const objectives = await db
    .select()
    .from(planObjectives)
    .where(
      and(
        eq(planObjectives.tenantId, ctx.tenantId),
        eq(planObjectives.planId, plan.id),
      ),
    )
    .orderBy(asc(planObjectives.orderIndex));

  const objectiveIds = objectives.map((objective) => objective.id);

  const strategies =
    objectiveIds.length > 0
      ? await db
          .select()
          .from(planStrategies)
          .where(
            and(
              eq(planStrategies.tenantId, ctx.tenantId),
              inArray(planStrategies.objectiveId, objectiveIds),
            ),
          )
          .orderBy(asc(planStrategies.orderIndex))
      : [];

  return {
    ...plan,
    objectives: objectives.map((objective) => ({
      ...objective,
      strategies: strategies.filter(
        (strategy) => strategy.objectiveId === objective.id,
      ),
    })),
  };
}

export async function listPlans(
  ctx: TenantContext,
  limit = 100,
): Promise<PlanRow[]> {
  assertTenantContext(ctx, 'listPlans');

  return db
    .select()
    .from(plans)
    .where(and(eq(plans.tenantId, ctx.tenantId), eq(plans.userId, ctx.userId)))
    .orderBy(desc(plans.updatedAt))
    .limit(Math.min(Math.max(limit, 1), 200));
}

export type UpdatePlanInput = {
  title?: string;
  description?: string | null;
  type?: PlanType;
  status?: PlanStatus;
};

export async function updatePlan(
  ctx: TenantContext,
  planId: string,
  input: UpdatePlanInput,
): Promise<PlanRow> {
  assertTenantContext(ctx, 'updatePlan');

  const patch: Record<string, unknown> = { updatedAt: new Date() };

  if (input.title !== undefined) {
    const title = input.title.trim().slice(0, 200);
    if (title.length === 0) throw new Error('El título no puede quedar vacío.');
    patch.title = title;
  }
  if (input.description !== undefined) {
    patch.description = input.description?.trim() || null;
  }
  if (input.type !== undefined) patch.type = input.type;
  if (input.status !== undefined) patch.status = input.status;

  const [row] = await db
    .update(plans)
    .set(patch)
    .where(
      and(
        eq(plans.id, planId),
        eq(plans.tenantId, ctx.tenantId),
        eq(plans.userId, ctx.userId),
      ),
    )
    .returning();

  if (!row) throw new Error('No se encontró el plan.');
  return row;
}

export async function deletePlan(
  ctx: TenantContext,
  planId: string,
): Promise<void> {
  assertTenantContext(ctx, 'deletePlan');

  await db
    .delete(plans)
    .where(
      and(
        eq(plans.id, planId),
        eq(plans.tenantId, ctx.tenantId),
        eq(plans.userId, ctx.userId),
      ),
    );
}

/** Comprueba que el plan sea de quien dice serlo antes de tocar sus hijos. */
async function assertOwnsPlan(
  ctx: TenantContext,
  planId: string,
): Promise<void> {
  const [row] = await db
    .select({ id: plans.id })
    .from(plans)
    .where(
      and(
        eq(plans.id, planId),
        eq(plans.tenantId, ctx.tenantId),
        eq(plans.userId, ctx.userId),
      ),
    )
    .limit(1);

  if (!row) throw new Error('No se encontró el plan.');
}

export type AddObjectiveInput = {
  title: string;
  description?: string | null;
  strategies?: string[];
};

export async function addPlanObjective(
  ctx: TenantContext,
  planId: string,
  input: AddObjectiveInput,
): Promise<PlanObjectiveRow> {
  assertTenantContext(ctx, 'addPlanObjective');
  await assertOwnsPlan(ctx, planId);

  const title = input.title.trim().slice(0, 300);
  if (title.length === 0) throw new Error('El objetivo necesita un título.');

  const existing = await db
    .select({ orderIndex: planObjectives.orderIndex })
    .from(planObjectives)
    .where(
      and(
        eq(planObjectives.tenantId, ctx.tenantId),
        eq(planObjectives.planId, planId),
      ),
    )
    .orderBy(desc(planObjectives.orderIndex))
    .limit(1);

  const nextIndex = (existing[0]?.orderIndex ?? -1) + 1;

  const [row] = await db
    .insert(planObjectives)
    .values({
      tenantId: ctx.tenantId,
      planId,
      title,
      description: input.description?.trim() || null,
      orderIndex: nextIndex,
    })
    .returning();

  if (!row) throw new Error('No se pudo agregar el objetivo.');

  const strategies = (input.strategies ?? [])
    .map((content) => content.trim())
    .filter((content) => content.length > 0);

  if (strategies.length > 0) {
    await db.insert(planStrategies).values(
      strategies.map((content, index) => ({
        tenantId: ctx.tenantId,
        objectiveId: row.id,
        content: content.slice(0, 1000),
        orderIndex: index,
      })),
    );
  }

  await db
    .update(plans)
    .set({ updatedAt: new Date() })
    .where(and(eq(plans.id, planId), eq(plans.tenantId, ctx.tenantId)));

  return row;
}

export async function updateObjective(
  ctx: TenantContext,
  objectiveId: string,
  input: { title?: string; description?: string | null; status?: ObjectiveStatus },
): Promise<PlanObjectiveRow> {
  assertTenantContext(ctx, 'updateObjective');

  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) {
    const title = input.title.trim().slice(0, 300);
    if (title.length === 0) throw new Error('El título no puede quedar vacío.');
    patch.title = title;
  }
  if (input.description !== undefined) {
    patch.description = input.description?.trim() || null;
  }
  if (input.status !== undefined) patch.status = input.status;

  const [row] = await db
    .update(planObjectives)
    .set(patch)
    .where(
      and(
        eq(planObjectives.id, objectiveId),
        eq(planObjectives.tenantId, ctx.tenantId),
      ),
    )
    .returning();

  if (!row) throw new Error('No se encontró el objetivo.');
  return row;
}

export async function deleteObjective(
  ctx: TenantContext,
  objectiveId: string,
): Promise<void> {
  assertTenantContext(ctx, 'deleteObjective');

  await db
    .delete(planObjectives)
    .where(
      and(
        eq(planObjectives.id, objectiveId),
        eq(planObjectives.tenantId, ctx.tenantId),
      ),
    );
}

export async function addStrategy(
  ctx: TenantContext,
  objectiveId: string,
  content: string,
): Promise<PlanStrategyRow> {
  assertTenantContext(ctx, 'addStrategy');

  const trimmed = content.trim().slice(0, 1000);
  if (trimmed.length === 0) throw new Error('La estrategia no puede ir vacía.');

  const existing = await db
    .select({ orderIndex: planStrategies.orderIndex })
    .from(planStrategies)
    .where(
      and(
        eq(planStrategies.tenantId, ctx.tenantId),
        eq(planStrategies.objectiveId, objectiveId),
      ),
    )
    .orderBy(desc(planStrategies.orderIndex))
    .limit(1);

  const [row] = await db
    .insert(planStrategies)
    .values({
      tenantId: ctx.tenantId,
      objectiveId,
      content: trimmed,
      orderIndex: (existing[0]?.orderIndex ?? -1) + 1,
    })
    .returning();

  if (!row) throw new Error('No se pudo agregar la estrategia.');
  return row;
}

export async function deleteStrategy(
  ctx: TenantContext,
  strategyId: string,
): Promise<void> {
  assertTenantContext(ctx, 'deleteStrategy');

  await db
    .delete(planStrategies)
    .where(
      and(
        eq(planStrategies.id, strategyId),
        eq(planStrategies.tenantId, ctx.tenantId),
      ),
    );
}

export async function logPlanProgress(
  ctx: TenantContext,
  planId: string,
  input: { objectiveId?: string | null; note?: string | null; rating?: number | null },
): Promise<PlanProgressRow> {
  assertTenantContext(ctx, 'logPlanProgress');
  await assertOwnsPlan(ctx, planId);

  const rating =
    input.rating === null || input.rating === undefined
      ? null
      : Math.min(5, Math.max(1, Math.round(input.rating)));

  const [row] = await db
    .insert(planProgress)
    .values({
      tenantId: ctx.tenantId,
      planId,
      objectiveId: input.objectiveId ?? null,
      note: input.note?.trim().slice(0, 2000) || null,
      rating,
    })
    .returning();

  if (!row) throw new Error('No se pudo registrar el avance.');

  await db
    .update(plans)
    .set({ updatedAt: new Date() })
    .where(and(eq(plans.id, planId), eq(plans.tenantId, ctx.tenantId)));

  return row;
}

export async function listPlanProgress(
  ctx: TenantContext,
  planId: string,
  limit = 50,
): Promise<PlanProgressRow[]> {
  assertTenantContext(ctx, 'listPlanProgress');

  return db
    .select()
    .from(planProgress)
    .where(
      and(
        eq(planProgress.tenantId, ctx.tenantId),
        eq(planProgress.planId, planId),
      ),
    )
    .orderBy(desc(planProgress.loggedAt))
    .limit(Math.min(Math.max(limit, 1), 200));
}
