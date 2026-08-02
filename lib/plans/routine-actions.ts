'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireTenantContext } from '../tenant/context';
import {
  addRoutineStep,
  deleteRoutine,
  deleteRoutineStep,
  logRoutineCompletion,
  reorderRoutineSteps,
  updateRoutine,
  updateRoutineStep,
} from '../db/repositories/routines';

export type RoutineActionResult = { ok: true } | { ok: false; error: string };

const idSchema = z.uuid();

function fail(error: string): RoutineActionResult {
  return { ok: false, error };
}

export async function updateRoutineAction(
  routineId: string,
  input: { title?: string; description?: string; active?: boolean },
): Promise<RoutineActionResult> {
  if (!idSchema.safeParse(routineId).success) return fail('Rutina no válida.');

  try {
    const ctx = await requireTenantContext();
    await updateRoutine(ctx, routineId, input);
    revalidatePath(`/rutinas/${routineId}`);
    revalidatePath('/rutinas');
    return { ok: true };
  } catch {
    return fail('No pudimos guardar el cambio.');
  }
}

export async function addStepAction(
  routineId: string,
  input: { title: string; durationMinutes?: number; icon?: string },
): Promise<RoutineActionResult> {
  if (!idSchema.safeParse(routineId).success) return fail('Rutina no válida.');

  try {
    const ctx = await requireTenantContext();
    await addRoutineStep(ctx, routineId, {
      title: input.title,
      durationSeconds:
        input.durationMinutes === undefined
          ? null
          : Math.round(input.durationMinutes * 60),
      icon: input.icon ?? null,
    });
    revalidatePath(`/rutinas/${routineId}`);
    return { ok: true };
  } catch {
    return fail('No pudimos agregar el paso.');
  }
}

export async function updateStepAction(
  routineId: string,
  stepId: string,
  input: { title?: string; durationMinutes?: number | null; note?: string | null },
): Promise<RoutineActionResult> {
  if (!idSchema.safeParse(stepId).success) return fail('Paso no válido.');

  try {
    const ctx = await requireTenantContext();
    await updateRoutineStep(ctx, stepId, {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.durationMinutes !== undefined
        ? {
            durationSeconds:
              input.durationMinutes === null
                ? null
                : Math.round(input.durationMinutes * 60),
          }
        : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
    });
    revalidatePath(`/rutinas/${routineId}`);
    return { ok: true };
  } catch {
    return fail('No pudimos guardar el paso.');
  }
}

export async function deleteStepAction(
  routineId: string,
  stepId: string,
): Promise<RoutineActionResult> {
  if (!idSchema.safeParse(stepId).success) return fail('Paso no válido.');

  try {
    const ctx = await requireTenantContext();
    await deleteRoutineStep(ctx, stepId);
    revalidatePath(`/rutinas/${routineId}`);
    return { ok: true };
  } catch {
    return fail('No pudimos eliminar el paso.');
  }
}

/**
 * Reordena la secuencia completa.
 *
 * La interfaz manda toda la lista, no «sube este paso»: así el servidor no
 * tiene que reconstruir el orden y no quedan estados intermedios raros si dos
 * cambios llegan casi juntos.
 */
export async function reorderStepsAction(
  routineId: string,
  orderedStepIds: string[],
): Promise<RoutineActionResult> {
  if (!idSchema.safeParse(routineId).success) return fail('Rutina no válida.');

  try {
    const ctx = await requireTenantContext();
    await reorderRoutineSteps(ctx, routineId, orderedStepIds);
    revalidatePath(`/rutinas/${routineId}`);
    return { ok: true };
  } catch {
    return fail('No pudimos cambiar el orden.');
  }
}

export async function logCompletionAction(
  routineId: string,
  completedStepIds: string[],
  note?: string,
): Promise<RoutineActionResult> {
  if (!idSchema.safeParse(routineId).success) return fail('Rutina no válida.');

  try {
    const ctx = await requireTenantContext();
    await logRoutineCompletion(ctx, routineId, { completedStepIds, note });
    revalidatePath(`/rutinas/${routineId}`);
    return { ok: true };
  } catch {
    return fail('No pudimos registrar el cumplimiento.');
  }
}

export async function deleteRoutineAction(routineId: string): Promise<void> {
  if (!idSchema.safeParse(routineId).success) return;

  const ctx = await requireTenantContext();
  await deleteRoutine(ctx, routineId);
  revalidatePath('/rutinas');
  redirect('/rutinas');
}
