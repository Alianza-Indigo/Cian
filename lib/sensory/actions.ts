'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireTenantContext } from '../tenant/context';
import {
  addSensoryTool,
  deleteSensoryTool,
  removeFromSensoryProfile,
  setToolEffective,
  updateSensoryProfile,
} from '../db/repositories/sensory';
import {
  completeTask,
  createTask,
  deleteTask,
  updateTask,
} from '../db/repositories/tasks';
import { SENSITIVITY_LEVELS, SENSORY_DOMAINS, TASK_PRIORITIES, TASK_STATUSES } from './types';

export type ActionResult = { ok: true } | { ok: false; error: string };

const idSchema = z.uuid();
const domainSchema = z.enum(SENSORY_DOMAINS);

function fail(error: string): ActionResult {
  return { ok: false, error };
}

// --- Sensorialidad ----------------------------------------------------------

export async function setSensitivityAction(
  domain: string,
  sensitivity: string,
): Promise<ActionResult> {
  const parsedDomain = domainSchema.safeParse(domain);
  const parsedLevel = z.enum(SENSITIVITY_LEVELS).safeParse(sensitivity);
  if (!parsedDomain.success || !parsedLevel.success) {
    return fail('Opción no válida.');
  }

  try {
    const ctx = await requireTenantContext();
    await updateSensoryProfile(ctx, {
      domain: parsedDomain.data,
      sensitivity: parsedLevel.data,
    });
    revalidatePath('/sensorialidad');
    return { ok: true };
  } catch {
    return fail('No pudimos guardar el cambio.');
  }
}

export async function addToProfileAction(
  domain: string,
  field: 'triggers' | 'strategies',
  value: string,
): Promise<ActionResult> {
  const parsedDomain = domainSchema.safeParse(domain);
  if (!parsedDomain.success) return fail('Dominio no válido.');
  if (value.trim().length === 0) return fail('Escribe algo primero.');

  try {
    const ctx = await requireTenantContext();
    await updateSensoryProfile(ctx, {
      domain: parsedDomain.data,
      ...(field === 'triggers'
        ? { triggers: [value] }
        : { strategies: [value] }),
    });
    revalidatePath('/sensorialidad');
    return { ok: true };
  } catch {
    return fail('No pudimos guardarlo.');
  }
}

export async function removeFromProfileAction(
  domain: string,
  field: 'triggers' | 'strategies',
  value: string,
): Promise<ActionResult> {
  const parsedDomain = domainSchema.safeParse(domain);
  if (!parsedDomain.success) return fail('Dominio no válido.');

  try {
    const ctx = await requireTenantContext();
    await removeFromSensoryProfile(ctx, parsedDomain.data, field, value);
    revalidatePath('/sensorialidad');
    return { ok: true };
  } catch {
    return fail('No pudimos quitarlo.');
  }
}

export async function addToolAction(
  name: string,
  domain?: string,
): Promise<ActionResult> {
  if (name.trim().length === 0) return fail('La herramienta necesita un nombre.');

  const parsedDomain = domain ? domainSchema.safeParse(domain) : null;

  try {
    const ctx = await requireTenantContext();
    await addSensoryTool(ctx, {
      name,
      domain: parsedDomain?.success ? parsedDomain.data : null,
    });
    revalidatePath('/sensorialidad');
    return { ok: true };
  } catch {
    return fail('No pudimos guardar la herramienta.');
  }
}

export async function setToolEffectiveAction(
  toolId: string,
  effective: boolean | null,
): Promise<ActionResult> {
  if (!idSchema.safeParse(toolId).success) return fail('Herramienta no válida.');

  try {
    const ctx = await requireTenantContext();
    await setToolEffective(ctx, toolId, effective);
    revalidatePath('/sensorialidad');
    return { ok: true };
  } catch {
    return fail('No pudimos guardar el cambio.');
  }
}

export async function deleteToolAction(toolId: string): Promise<ActionResult> {
  if (!idSchema.safeParse(toolId).success) return fail('Herramienta no válida.');

  try {
    const ctx = await requireTenantContext();
    await deleteSensoryTool(ctx, toolId);
    revalidatePath('/sensorialidad');
    return { ok: true };
  } catch {
    return fail('No pudimos eliminarla.');
  }
}

// --- Tareas -----------------------------------------------------------------

export async function createTaskAction(
  title: string,
  priority?: string,
): Promise<ActionResult> {
  if (title.trim().length === 0) return fail('La tarea necesita un título.');

  const parsedPriority = priority
    ? z.enum(TASK_PRIORITIES).safeParse(priority)
    : null;

  try {
    const ctx = await requireTenantContext();
    await createTask(ctx, {
      title,
      ...(parsedPriority?.success ? { priority: parsedPriority.data } : {}),
    });
    revalidatePath('/tareas');
    return { ok: true };
  } catch {
    return fail('No pudimos guardar la tarea.');
  }
}

export async function setTaskStatusAction(
  taskId: string,
  status: string,
): Promise<ActionResult> {
  if (!idSchema.safeParse(taskId).success) return fail('Tarea no válida.');

  const parsed = z.enum(TASK_STATUSES).safeParse(status);
  if (!parsed.success) return fail('Estado no válido.');

  try {
    const ctx = await requireTenantContext();
    if (parsed.data === 'hecha') {
      await completeTask(ctx, taskId);
    } else {
      await updateTask(ctx, taskId, { status: parsed.data });
    }
    revalidatePath('/tareas');
    return { ok: true };
  } catch {
    return fail('No pudimos guardar el cambio.');
  }
}

export async function deleteTaskAction(taskId: string): Promise<ActionResult> {
  if (!idSchema.safeParse(taskId).success) return fail('Tarea no válida.');

  try {
    const ctx = await requireTenantContext();
    await deleteTask(ctx, taskId);
    revalidatePath('/tareas');
    return { ok: true };
  } catch {
    return fail('No pudimos eliminar la tarea.');
  }
}
