'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireTenantContext } from '../tenant/context';
import {
  addPlanObjective,
  addStrategy,
  deleteObjective,
  deletePlan,
  deleteStrategy,
  getPlan,
  listPlanProgress,
  logPlanProgress,
  updateObjective,
  updatePlan,
} from '../db/repositories/plans';
import { createDocument } from '../db/repositories/documents';
import { runDocumentGeneration } from '../documents/generate';
import { planToMarkdown } from './export';
import { OBJECTIVE_STATUSES, PLAN_STATUSES } from './types';

export type PlanActionResult = { ok: true } | { ok: false; error: string };

const idSchema = z.uuid();

function fail(error: string): PlanActionResult {
  return { ok: false, error };
}

export async function updatePlanAction(
  planId: string,
  input: { title?: string; description?: string; status?: string },
): Promise<PlanActionResult> {
  if (!idSchema.safeParse(planId).success) return fail('Plan no válido.');

  const status = PLAN_STATUSES.find((candidate) => candidate === input.status);

  try {
    const ctx = await requireTenantContext();
    await updatePlan(ctx, planId, {
      title: input.title,
      description: input.description,
      ...(status ? { status } : {}),
    });
    revalidatePath(`/planes/${planId}`);
    revalidatePath('/planes');
    return { ok: true };
  } catch {
    return fail('No pudimos guardar el cambio.');
  }
}

export async function addObjectiveAction(
  planId: string,
  title: string,
): Promise<PlanActionResult> {
  if (!idSchema.safeParse(planId).success) return fail('Plan no válido.');

  try {
    const ctx = await requireTenantContext();
    await addPlanObjective(ctx, planId, { title });
    revalidatePath(`/planes/${planId}`);
    return { ok: true };
  } catch {
    return fail('No pudimos agregar el objetivo.');
  }
}

export async function updateObjectiveAction(
  planId: string,
  objectiveId: string,
  input: { title?: string; status?: string },
): Promise<PlanActionResult> {
  if (!idSchema.safeParse(objectiveId).success) return fail('Objetivo no válido.');

  const status = OBJECTIVE_STATUSES.find(
    (candidate) => candidate === input.status,
  );

  try {
    const ctx = await requireTenantContext();
    await updateObjective(ctx, objectiveId, {
      title: input.title,
      ...(status ? { status } : {}),
    });
    revalidatePath(`/planes/${planId}`);
    return { ok: true };
  } catch {
    return fail('No pudimos guardar el objetivo.');
  }
}

export async function deleteObjectiveAction(
  planId: string,
  objectiveId: string,
): Promise<PlanActionResult> {
  if (!idSchema.safeParse(objectiveId).success) return fail('Objetivo no válido.');

  try {
    const ctx = await requireTenantContext();
    await deleteObjective(ctx, objectiveId);
    revalidatePath(`/planes/${planId}`);
    return { ok: true };
  } catch {
    return fail('No pudimos eliminar el objetivo.');
  }
}

export async function addStrategyAction(
  planId: string,
  objectiveId: string,
  content: string,
): Promise<PlanActionResult> {
  if (!idSchema.safeParse(objectiveId).success) return fail('Objetivo no válido.');

  try {
    const ctx = await requireTenantContext();
    await addStrategy(ctx, objectiveId, content);
    revalidatePath(`/planes/${planId}`);
    return { ok: true };
  } catch {
    return fail('No pudimos agregar la estrategia.');
  }
}

export async function deleteStrategyAction(
  planId: string,
  strategyId: string,
): Promise<PlanActionResult> {
  if (!idSchema.safeParse(strategyId).success) return fail('Estrategia no válida.');

  try {
    const ctx = await requireTenantContext();
    await deleteStrategy(ctx, strategyId);
    revalidatePath(`/planes/${planId}`);
    return { ok: true };
  } catch {
    return fail('No pudimos eliminar la estrategia.');
  }
}

export async function logProgressAction(
  planId: string,
  input: { objectiveId?: string; note: string; rating?: number },
): Promise<PlanActionResult> {
  if (!idSchema.safeParse(planId).success) return fail('Plan no válido.');

  try {
    const ctx = await requireTenantContext();
    await logPlanProgress(ctx, planId, {
      objectiveId: input.objectiveId ?? null,
      note: input.note,
      rating: input.rating ?? null,
    });
    revalidatePath(`/planes/${planId}`);
    return { ok: true };
  } catch {
    return fail('No pudimos registrar el avance.');
  }
}

export async function deletePlanAction(planId: string): Promise<void> {
  if (!idSchema.safeParse(planId).success) return;

  const ctx = await requireTenantContext();
  await deletePlan(ctx, planId);
  revalidatePath('/planes');
  redirect('/planes');
}

/**
 * Exporta el plan a PDF reutilizando el generador de la Fase 2.
 *
 * Aquí se espera el resultado, igual que al regenerar un documento: lo pidió
 * una persona que acaba de pulsar un botón y quiere descargarlo.
 */
export async function exportPlanAction(
  planId: string,
): Promise<PlanActionResult & { documentId?: string }> {
  if (!idSchema.safeParse(planId).success) return fail('Plan no válido.');

  try {
    const ctx = await requireTenantContext();

    const plan = await getPlan(ctx, planId);
    if (!plan) return fail('No encontramos el plan.');

    const progress = await listPlanProgress(ctx, planId, 50);

    const { document } = await createDocument(ctx, {
      type: 'informe',
      title: plan.title,
      format: 'pdf',
      sourceContent: planToMarkdown(plan, progress),
      conversationId: plan.conversationId,
    });

    await runDocumentGeneration(ctx, document.id);

    revalidatePath('/documentos');
    return { ok: true, documentId: document.id };
  } catch {
    return fail('No pudimos exportar el plan.');
  }
}
