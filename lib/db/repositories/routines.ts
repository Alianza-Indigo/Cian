import { and, asc, desc, eq } from 'drizzle-orm';
import { db } from '../client';
import {
  routineLogs,
  routineSteps,
  routines,
  type RoutineLogRow,
  type RoutineRow,
  type RoutineStepRow,
} from '../schema/routines';
import { assertTenantContext, type TenantContext } from '../../tenant/guard';
import {
  STEP_DURATION_MAX_SECONDS,
  STEP_DURATION_MIN_SECONDS,
  type RoutineType,
} from '../../plans/types';

export type FullRoutine = RoutineRow & { steps: RoutineStepRow[] };

export type StepInput = {
  title: string;
  durationSeconds?: number | null;
  icon?: string | null;
  /**
   * Ruta de la imagen del paso, siempre a `/api/adjuntos/<id>` y nunca al
   * almacén: el adjunto es privado y se sirve por una ruta que comprueba el
   * tenant. Una URL del store sería un enlace público a la foto de la cocina de
   * alguien.
   */
  imageUrl?: string | null;
  note?: string | null;
};

export type CreateRoutineInput = {
  type: RoutineType;
  title: string;
  description?: string | null;
  conversationId?: string | null;
  steps?: StepInput[];
};

/**
 * Solo se acepta una ruta a nuestro propio servidor de adjuntos.
 *
 * Cualquier otra cosa se descarta en silencio. Sin esto, escribir `image_url`
 * sería escribir un `<img src>` arbitrario, y una imagen remota en la pantalla
 * de una rutina le cuenta al servidor de quien la sirve cuándo la abre esta
 * persona, y desde dónde.
 */
function safeAttachmentPath(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return /^\/api\/adjuntos\/[0-9a-f-]{36}$/i.test(trimmed) ? trimmed : null;
}

function clampDuration(seconds: number | null | undefined): number | null {
  if (seconds === null || seconds === undefined) return null;
  if (!Number.isFinite(seconds)) return null;
  return Math.min(
    STEP_DURATION_MAX_SECONDS,
    Math.max(STEP_DURATION_MIN_SECONDS, Math.round(seconds)),
  );
}

export async function createRoutine(
  ctx: TenantContext,
  input: CreateRoutineInput,
): Promise<FullRoutine> {
  assertTenantContext(ctx, 'createRoutine');

  const title = input.title.trim().slice(0, 200);
  if (title.length === 0) throw new Error('La rutina necesita un título.');

  const routineId = await db.transaction(async (tx) => {
    const [routine] = await tx
      .insert(routines)
      .values({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        conversationId: input.conversationId ?? null,
        type: input.type,
        title,
        description: input.description?.trim() || null,
      })
      .returning();

    if (!routine) throw new Error('No se pudo crear la rutina.');

    const steps = (input.steps ?? [])
      .map((step) => ({ ...step, title: step.title.trim() }))
      .filter((step) => step.title.length > 0);

    if (steps.length > 0) {
      await tx.insert(routineSteps).values(
        steps.map((step, index) => ({
          tenantId: ctx.tenantId,
          routineId: routine.id,
          orderIndex: index,
          title: step.title.slice(0, 300),
          durationSeconds: clampDuration(step.durationSeconds),
          icon: step.icon?.trim().slice(0, 8) || null,
          note: step.note?.trim().slice(0, 1000) || null,
        })),
      );
    }

    return routine.id;
  });

  const created = await getRoutine(ctx, routineId);
  if (!created) throw new Error('No se pudo leer la rutina recién creada.');
  return created;
}

export async function getRoutine(
  ctx: TenantContext,
  routineId: string,
): Promise<FullRoutine | null> {
  assertTenantContext(ctx, 'getRoutine');

  const [routine] = await db
    .select()
    .from(routines)
    .where(
      and(
        eq(routines.id, routineId),
        eq(routines.tenantId, ctx.tenantId),
        eq(routines.userId, ctx.userId),
      ),
    )
    .limit(1);

  if (!routine) return null;

  const steps = await db
    .select()
    .from(routineSteps)
    .where(
      and(
        eq(routineSteps.tenantId, ctx.tenantId),
        eq(routineSteps.routineId, routine.id),
      ),
    )
    .orderBy(asc(routineSteps.orderIndex));

  return { ...routine, steps };
}

export async function listRoutines(
  ctx: TenantContext,
  limit = 100,
): Promise<RoutineRow[]> {
  assertTenantContext(ctx, 'listRoutines');

  return db
    .select()
    .from(routines)
    .where(
      and(eq(routines.tenantId, ctx.tenantId), eq(routines.userId, ctx.userId)),
    )
    .orderBy(desc(routines.updatedAt))
    .limit(Math.min(Math.max(limit, 1), 200));
}

export async function updateRoutine(
  ctx: TenantContext,
  routineId: string,
  input: {
    title?: string;
    description?: string | null;
    type?: RoutineType;
    active?: boolean;
  },
): Promise<RoutineRow> {
  assertTenantContext(ctx, 'updateRoutine');

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
  if (input.active !== undefined) patch.active = input.active;

  const [row] = await db
    .update(routines)
    .set(patch)
    .where(
      and(
        eq(routines.id, routineId),
        eq(routines.tenantId, ctx.tenantId),
        eq(routines.userId, ctx.userId),
      ),
    )
    .returning();

  if (!row) throw new Error('No se encontró la rutina.');
  return row;
}

export async function deleteRoutine(
  ctx: TenantContext,
  routineId: string,
): Promise<void> {
  assertTenantContext(ctx, 'deleteRoutine');

  await db
    .delete(routines)
    .where(
      and(
        eq(routines.id, routineId),
        eq(routines.tenantId, ctx.tenantId),
        eq(routines.userId, ctx.userId),
      ),
    );
}

async function assertOwnsRoutine(
  ctx: TenantContext,
  routineId: string,
): Promise<void> {
  const [row] = await db
    .select({ id: routines.id })
    .from(routines)
    .where(
      and(
        eq(routines.id, routineId),
        eq(routines.tenantId, ctx.tenantId),
        eq(routines.userId, ctx.userId),
      ),
    )
    .limit(1);

  if (!row) throw new Error('No se encontró la rutina.');
}

export async function addRoutineStep(
  ctx: TenantContext,
  routineId: string,
  step: StepInput,
): Promise<RoutineStepRow> {
  assertTenantContext(ctx, 'addRoutineStep');
  await assertOwnsRoutine(ctx, routineId);

  const title = step.title.trim().slice(0, 300);
  if (title.length === 0) throw new Error('El paso necesita un título.');

  const existing = await db
    .select({ orderIndex: routineSteps.orderIndex })
    .from(routineSteps)
    .where(
      and(
        eq(routineSteps.tenantId, ctx.tenantId),
        eq(routineSteps.routineId, routineId),
      ),
    )
    .orderBy(desc(routineSteps.orderIndex))
    .limit(1);

  const [row] = await db
    .insert(routineSteps)
    .values({
      tenantId: ctx.tenantId,
      routineId,
      orderIndex: (existing[0]?.orderIndex ?? -1) + 1,
      title,
      durationSeconds: clampDuration(step.durationSeconds),
      icon: step.icon?.trim().slice(0, 8) || null,
      imageUrl: safeAttachmentPath(step.imageUrl),
      note: step.note?.trim().slice(0, 1000) || null,
    })
    .returning();

  if (!row) throw new Error('No se pudo agregar el paso.');
  return row;
}

export async function updateRoutineStep(
  ctx: TenantContext,
  stepId: string,
  input: Partial<StepInput>,
): Promise<RoutineStepRow> {
  assertTenantContext(ctx, 'updateRoutineStep');

  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) {
    const title = input.title.trim().slice(0, 300);
    if (title.length === 0) throw new Error('El título no puede quedar vacío.');
    patch.title = title;
  }
  if (input.durationSeconds !== undefined) {
    patch.durationSeconds = clampDuration(input.durationSeconds);
  }
  if (input.icon !== undefined) patch.icon = input.icon?.trim().slice(0, 8) || null;
  if (input.imageUrl !== undefined) {
    patch.imageUrl = safeAttachmentPath(input.imageUrl);
  }
  if (input.note !== undefined) patch.note = input.note?.trim().slice(0, 1000) || null;

  const [row] = await db
    .update(routineSteps)
    .set(patch)
    .where(
      and(
        eq(routineSteps.id, stepId),
        eq(routineSteps.tenantId, ctx.tenantId),
      ),
    )
    .returning();

  if (!row) throw new Error('No se encontró el paso.');
  return row;
}

export async function deleteRoutineStep(
  ctx: TenantContext,
  stepId: string,
): Promise<void> {
  assertTenantContext(ctx, 'deleteRoutineStep');

  await db
    .delete(routineSteps)
    .where(
      and(eq(routineSteps.id, stepId), eq(routineSteps.tenantId, ctx.tenantId)),
    );
}

/**
 * Reordena la secuencia completa.
 *
 * Recibe los identificadores en el orden deseado y reescribe todos los
 * índices en una transacción. Reordenar de a un paso dejaría estados
 * intermedios con índices repetidos, y la secuencia visual los recorrería mal.
 */
export async function reorderRoutineSteps(
  ctx: TenantContext,
  routineId: string,
  orderedStepIds: string[],
): Promise<RoutineStepRow[]> {
  assertTenantContext(ctx, 'reorderRoutineSteps');
  await assertOwnsRoutine(ctx, routineId);

  const current = await db
    .select({ id: routineSteps.id })
    .from(routineSteps)
    .where(
      and(
        eq(routineSteps.tenantId, ctx.tenantId),
        eq(routineSteps.routineId, routineId),
      ),
    );

  const known = new Set(current.map((step) => step.id));
  const ordered = orderedStepIds.filter((id) => known.has(id));

  // Los que no vengan en la lista se quedan al final, en su orden actual: así
  // una lista incompleta no borra pasos del recorrido.
  for (const step of current) {
    if (!ordered.includes(step.id)) ordered.push(step.id);
  }

  await db.transaction(async (tx) => {
    for (const [index, stepId] of ordered.entries()) {
      await tx
        .update(routineSteps)
        .set({ orderIndex: index })
        .where(
          and(
            eq(routineSteps.id, stepId),
            eq(routineSteps.tenantId, ctx.tenantId),
          ),
        );
    }
  });

  await db
    .update(routines)
    .set({ updatedAt: new Date() })
    .where(and(eq(routines.id, routineId), eq(routines.tenantId, ctx.tenantId)));

  const routine = await getRoutine(ctx, routineId);
  return routine?.steps ?? [];
}

export async function logRoutineCompletion(
  ctx: TenantContext,
  routineId: string,
  input: { completedStepIds: string[]; note?: string | null },
): Promise<RoutineLogRow> {
  assertTenantContext(ctx, 'logRoutineCompletion');
  await assertOwnsRoutine(ctx, routineId);

  const [row] = await db
    .insert(routineLogs)
    .values({
      tenantId: ctx.tenantId,
      routineId,
      completedSteps: input.completedStepIds.slice(0, 200),
      note: input.note?.trim().slice(0, 1000) || null,
    })
    .returning();

  if (!row) throw new Error('No se pudo registrar el cumplimiento.');
  return row;
}

export async function listRoutineLogs(
  ctx: TenantContext,
  routineId: string,
  limit = 30,
): Promise<RoutineLogRow[]> {
  assertTenantContext(ctx, 'listRoutineLogs');

  return db
    .select()
    .from(routineLogs)
    .where(
      and(
        eq(routineLogs.tenantId, ctx.tenantId),
        eq(routineLogs.routineId, routineId),
      ),
    )
    .orderBy(desc(routineLogs.completedAt))
    .limit(Math.min(Math.max(limit, 1), 200));
}
