import { and, asc, eq, isNull } from 'drizzle-orm';
import { db } from '../client';
import { tasks, type TaskRow } from '../schema/daily-life';
import { assertTenantContext, type TenantContext } from '../../tenant/guard';
import {
  MAX_SUBTASKS,
  type TaskPriority,
  type TaskStatus,
} from '../../sensory/types';

export type TaskWithSubtasks = TaskRow & { subtasks: TaskRow[] };

export type CreateTaskInput = {
  title: string;
  notes?: string | null;
  priority?: TaskPriority;
  estimatedMinutes?: number | null;
  dueAt?: Date | null;
  parentTaskId?: string | null;
};

function clampMinutes(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return Math.min(600, Math.max(1, Math.round(value)));
}

export async function createTask(
  ctx: TenantContext,
  input: CreateTaskInput,
): Promise<TaskRow> {
  assertTenantContext(ctx, 'createTask');

  const title = input.title.trim().slice(0, 300);
  if (title.length === 0) throw new Error('La tarea necesita un título.');

  const [row] = await db
    .insert(tasks)
    .values({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      parentTaskId: input.parentTaskId ?? null,
      title,
      notes: input.notes?.trim().slice(0, 2000) || null,
      priority: input.priority ?? 'media',
      estimatedMinutes: clampMinutes(input.estimatedMinutes),
      dueAt: input.dueAt ?? null,
    })
    .returning();

  if (!row) throw new Error('No se pudo crear la tarea.');
  return row;
}

export async function getTask(
  ctx: TenantContext,
  taskId: string,
): Promise<TaskWithSubtasks | null> {
  assertTenantContext(ctx, 'getTask');

  const [task] = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.id, taskId),
        eq(tasks.tenantId, ctx.tenantId),
        eq(tasks.userId, ctx.userId),
      ),
    )
    .limit(1);

  if (!task) return null;

  const subtasks = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.tenantId, ctx.tenantId),
        eq(tasks.userId, ctx.userId),
        eq(tasks.parentTaskId, task.id),
      ),
    )
    .orderBy(asc(tasks.orderIndex));

  return { ...task, subtasks };
}

/** Tareas de primer nivel con sus subtareas. Las subtareas no aparecen solas. */
export async function listTasks(
  ctx: TenantContext,
  options: { status?: TaskStatus; limit?: number } = {},
): Promise<TaskWithSubtasks[]> {
  assertTenantContext(ctx, 'listTasks');

  const filters = [
    eq(tasks.tenantId, ctx.tenantId),
    eq(tasks.userId, ctx.userId),
    isNull(tasks.parentTaskId),
  ];

  if (options.status) filters.push(eq(tasks.status, options.status));

  const parents = await db
    .select()
    .from(tasks)
    .where(and(...filters))
    .orderBy(asc(tasks.orderIndex), asc(tasks.createdAt))
    .limit(Math.min(Math.max(options.limit ?? 100, 1), 200));

  if (parents.length === 0) return [];

  const children = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.tenantId, ctx.tenantId),
        eq(tasks.userId, ctx.userId),
      ),
    )
    .orderBy(asc(tasks.orderIndex));

  return parents.map((parent) => ({
    ...parent,
    subtasks: children.filter((child) => child.parentTaskId === parent.id),
  }));
}

/**
 * Reemplaza las subtareas de una tarea.
 *
 * Se acota a `MAX_SUBTASKS` a propósito: el criterio de aceptación pide que
 * ante una dificultad de inicio se devuelva un primer paso mínimo, **no una
 * lista de diez cosas**. Una lista larga ante la parálisis es más parálisis.
 */
export async function replaceSubtasks(
  ctx: TenantContext,
  parentTaskId: string,
  subtasks: Array<{ title: string; estimatedMinutes?: number | null }>,
): Promise<TaskRow[]> {
  assertTenantContext(ctx, 'replaceSubtasks');

  const parent = await getTask(ctx, parentTaskId);
  if (!parent) throw new Error('No se encontró la tarea.');

  const cleaned = subtasks
    .map((subtask) => ({
      title: subtask.title.trim().slice(0, 300),
      estimatedMinutes: clampMinutes(subtask.estimatedMinutes),
    }))
    .filter((subtask) => subtask.title.length > 0)
    .slice(0, MAX_SUBTASKS);

  return db.transaction(async (tx) => {
    await tx
      .delete(tasks)
      .where(
        and(
          eq(tasks.tenantId, ctx.tenantId),
          eq(tasks.parentTaskId, parentTaskId),
        ),
      );

    if (cleaned.length === 0) return [];

    return tx
      .insert(tasks)
      .values(
        cleaned.map((subtask, index) => ({
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          parentTaskId,
          title: subtask.title,
          estimatedMinutes: subtask.estimatedMinutes,
          orderIndex: index,
        })),
      )
      .returning();
  });
}

export async function updateTask(
  ctx: TenantContext,
  taskId: string,
  input: {
    title?: string;
    notes?: string | null;
    priority?: TaskPriority;
    status?: TaskStatus;
    estimatedMinutes?: number | null;
    dueAt?: Date | null;
    orderIndex?: number;
  },
): Promise<TaskRow> {
  assertTenantContext(ctx, 'updateTask');

  const patch: Record<string, unknown> = {};

  if (input.title !== undefined) {
    const title = input.title.trim().slice(0, 300);
    if (title.length === 0) throw new Error('El título no puede quedar vacío.');
    patch.title = title;
  }
  if (input.notes !== undefined) {
    patch.notes = input.notes?.trim().slice(0, 2000) || null;
  }
  if (input.priority !== undefined) patch.priority = input.priority;
  if (input.estimatedMinutes !== undefined) {
    patch.estimatedMinutes = clampMinutes(input.estimatedMinutes);
  }
  if (input.dueAt !== undefined) patch.dueAt = input.dueAt;
  if (input.orderIndex !== undefined) patch.orderIndex = input.orderIndex;
  if (input.status !== undefined) {
    patch.status = input.status;
    patch.completedAt = input.status === 'hecha' ? new Date() : null;
  }

  const [row] = await db
    .update(tasks)
    .set(patch)
    .where(
      and(
        eq(tasks.id, taskId),
        eq(tasks.tenantId, ctx.tenantId),
        eq(tasks.userId, ctx.userId),
      ),
    )
    .returning();

  if (!row) throw new Error('No se encontró la tarea.');
  return row;
}

export async function completeTask(
  ctx: TenantContext,
  taskId: string,
): Promise<TaskRow> {
  return updateTask(ctx, taskId, { status: 'hecha' });
}

export async function deleteTask(
  ctx: TenantContext,
  taskId: string,
): Promise<void> {
  assertTenantContext(ctx, 'deleteTask');

  await db.transaction(async (tx) => {
    // Las subtareas no tienen llave foránea hacia la madre (es autorreferencia
    // sin cascada), así que se borran a mano.
    await tx
      .delete(tasks)
      .where(
        and(eq(tasks.tenantId, ctx.tenantId), eq(tasks.parentTaskId, taskId)),
      );

    await tx
      .delete(tasks)
      .where(
        and(
          eq(tasks.id, taskId),
          eq(tasks.tenantId, ctx.tenantId),
          eq(tasks.userId, ctx.userId),
        ),
      );
  });
}

/** Aplica un orden nuevo a las tareas de primer nivel. */
export async function prioritizeTasks(
  ctx: TenantContext,
  orderedTaskIds: string[],
): Promise<void> {
  assertTenantContext(ctx, 'prioritizeTasks');
  if (orderedTaskIds.length === 0) return;

  await db.transaction(async (tx) => {
    for (const [index, taskId] of orderedTaskIds.entries()) {
      await tx
        .update(tasks)
        .set({ orderIndex: index })
        .where(
          and(
            eq(tasks.id, taskId),
            eq(tasks.tenantId, ctx.tenantId),
            eq(tasks.userId, ctx.userId),
          ),
        );
    }
  });
}
