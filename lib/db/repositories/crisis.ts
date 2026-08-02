import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '../client';
import {
  crisisEvents,
  crisisProtocols,
  type CrisisEventRow,
  type CrisisProtocolRow,
} from '../schema/crisis';
import { assertTenantContext, type TenantContext } from '../../tenant/guard';
import {
  MAX_CRISIS_STEPS,
  PATTERN_WINDOW,
  type CrisisAction,
  type CrisisOutcome,
  type CrisisSeverity,
  type CrisisStep,
} from '../../crisis/types';

// --- Episodios ---------------------------------------------------------------

export type StartCrisisEventInput = {
  conversationId?: string | null;
  severity: CrisisSeverity;
  triggers?: string[];
};

function cleanList(values: string[] | undefined, max = 20): string[] {
  return [
    ...new Set(
      (values ?? [])
        .map((value) => value.trim().slice(0, 300))
        .filter((value) => value.length > 0),
    ),
  ].slice(0, max);
}

export function cleanSteps(steps: CrisisStep[] | undefined): CrisisStep[] {
  return (steps ?? [])
    .map((step) => ({
      title: step.title.trim().slice(0, 200),
      detail: step.detail?.trim().slice(0, 500) || null,
    }))
    .filter((step) => step.title.length > 0)
    .slice(0, MAX_CRISIS_STEPS);
}

/** Abre un episodio al activarse el acompañamiento. Se cierra al registrarlo. */
export async function startCrisisEvent(
  ctx: TenantContext,
  input: StartCrisisEventInput,
): Promise<CrisisEventRow> {
  assertTenantContext(ctx, 'startCrisisEvent');

  const [row] = await db
    .insert(crisisEvents)
    .values({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      conversationId: input.conversationId ?? null,
      severity: input.severity,
      triggers: cleanList(input.triggers),
    })
    .returning();

  if (!row) throw new Error('No se pudo registrar el episodio.');
  return row;
}

/**
 * Deja constancia de que la escalera de derivación se disparó.
 *
 * Guarda categorías, nunca el mensaje: ver el comentario del esquema. El
 * episodio nace y muere en el mismo instante porque CIAN no acompañó nada —
 * derivó y se detuvo.
 */
export async function recordEscalation(
  ctx: TenantContext,
  input: { conversationId?: string | null; categories: string[] },
): Promise<CrisisEventRow> {
  assertTenantContext(ctx, 'recordEscalation');

  const now = new Date();

  const [row] = await db
    .insert(crisisEvents)
    .values({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      conversationId: input.conversationId ?? null,
      severity: 'intensa',
      escalated: true,
      escalationSignals: cleanList(input.categories, 5),
      outcome: 'se_derivo',
      startedAt: now,
      endedAt: now,
    })
    .returning();

  if (!row) throw new Error('No se pudo registrar la derivación.');
  return row;
}

/** El episodio abierto más reciente, si lo hay. */
export async function getOpenCrisisEvent(
  ctx: TenantContext,
  conversationId?: string | null,
): Promise<CrisisEventRow | null> {
  assertTenantContext(ctx, 'getOpenCrisisEvent');

  const [row] = await db
    .select()
    .from(crisisEvents)
    .where(
      and(
        eq(crisisEvents.tenantId, ctx.tenantId),
        eq(crisisEvents.userId, ctx.userId),
        isNull(crisisEvents.endedAt),
        ...(conversationId
          ? [eq(crisisEvents.conversationId, conversationId)]
          : []),
      ),
    )
    .orderBy(desc(crisisEvents.startedAt))
    .limit(1);

  return row ?? null;
}

export type CloseCrisisEventInput = {
  eventId?: string | null;
  conversationId?: string | null;
  severity?: CrisisSeverity;
  summary?: string | null;
  triggers?: string[];
  actionsTaken?: CrisisAction[];
  outcome?: CrisisOutcome | null;
};

function cleanActions(actions: CrisisAction[] | undefined): CrisisAction[] {
  return (actions ?? [])
    .map((entry) => ({
      action: entry.action.trim().slice(0, 300),
      helped: entry.helped ?? null,
    }))
    .filter((entry) => entry.action.length > 0)
    .slice(0, 20);
}

/**
 * Registra el episodio ya pasado: qué pasó, qué se intentó, qué funcionó.
 *
 * Si hay un episodio abierto lo completa; si no, crea uno cerrado. Registrar
 * en frío —al día siguiente, sin haber activado el modo crisis— es un caso
 * normal, no una excepción.
 */
export async function closeCrisisEvent(
  ctx: TenantContext,
  input: CloseCrisisEventInput,
): Promise<CrisisEventRow> {
  assertTenantContext(ctx, 'closeCrisisEvent');

  const existing = input.eventId
    ? await getCrisisEvent(ctx, input.eventId)
    : await getOpenCrisisEvent(ctx, input.conversationId);

  const values = {
    summary: input.summary?.trim().slice(0, 4000) || null,
    triggers: cleanList(input.triggers),
    actionsTaken: cleanActions(input.actionsTaken),
    outcome: input.outcome ?? null,
    endedAt: new Date(),
    ...(input.severity ? { severity: input.severity } : {}),
  };

  if (!existing) {
    const [row] = await db
      .insert(crisisEvents)
      .values({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        conversationId: input.conversationId ?? null,
        severity: input.severity ?? 'moderada',
        ...values,
      })
      .returning();

    if (!row) throw new Error('No se pudo registrar el episodio.');
    return row;
  }

  const [row] = await db
    .update(crisisEvents)
    .set({
      ...values,
      // Los disparadores del registro se suman a los que se anotaron al
      // activar: lo dicho en caliente y lo recordado en frío valen igual.
      triggers: cleanList([...existing.triggers, ...(input.triggers ?? [])]),
    })
    .where(
      and(
        eq(crisisEvents.id, existing.id),
        eq(crisisEvents.tenantId, ctx.tenantId),
        eq(crisisEvents.userId, ctx.userId),
      ),
    )
    .returning();

  if (!row) throw new Error('No se pudo actualizar el episodio.');
  return row;
}

export async function getCrisisEvent(
  ctx: TenantContext,
  eventId: string,
): Promise<CrisisEventRow | null> {
  assertTenantContext(ctx, 'getCrisisEvent');

  const [row] = await db
    .select()
    .from(crisisEvents)
    .where(
      and(
        eq(crisisEvents.id, eventId),
        eq(crisisEvents.tenantId, ctx.tenantId),
        eq(crisisEvents.userId, ctx.userId),
      ),
    )
    .limit(1);

  return row ?? null;
}

export async function listCrisisEvents(
  ctx: TenantContext,
  limit = 30,
): Promise<CrisisEventRow[]> {
  assertTenantContext(ctx, 'listCrisisEvents');

  return db
    .select()
    .from(crisisEvents)
    .where(
      and(
        eq(crisisEvents.tenantId, ctx.tenantId),
        eq(crisisEvents.userId, ctx.userId),
      ),
    )
    .orderBy(desc(crisisEvents.startedAt))
    .limit(Math.min(Math.max(limit, 1), PATTERN_WINDOW));
}

export async function linkPostPlan(
  ctx: TenantContext,
  eventId: string,
  planId: string,
): Promise<void> {
  assertTenantContext(ctx, 'linkPostPlan');

  await db
    .update(crisisEvents)
    .set({ postPlanId: planId })
    .where(
      and(
        eq(crisisEvents.id, eventId),
        eq(crisisEvents.tenantId, ctx.tenantId),
        eq(crisisEvents.userId, ctx.userId),
      ),
    );
}

export async function deleteCrisisEvent(
  ctx: TenantContext,
  eventId: string,
): Promise<void> {
  assertTenantContext(ctx, 'deleteCrisisEvent');

  await db
    .delete(crisisEvents)
    .where(
      and(
        eq(crisisEvents.id, eventId),
        eq(crisisEvents.tenantId, ctx.tenantId),
        eq(crisisEvents.userId, ctx.userId),
      ),
    );
}

// --- Protocolos --------------------------------------------------------------

export async function saveCrisisProtocol(
  ctx: TenantContext,
  input: { id?: string | null; title: string; steps: CrisisStep[] },
): Promise<CrisisProtocolRow> {
  assertTenantContext(ctx, 'saveCrisisProtocol');

  const title = input.title.trim().slice(0, 200);
  if (title.length === 0) throw new Error('El protocolo necesita un título.');

  const steps = cleanSteps(input.steps);
  if (steps.length === 0) throw new Error('El protocolo necesita al menos un paso.');

  if (input.id) {
    const [row] = await db
      .update(crisisProtocols)
      .set({ title, steps, updatedAt: new Date() })
      .where(
        and(
          eq(crisisProtocols.id, input.id),
          eq(crisisProtocols.tenantId, ctx.tenantId),
          eq(crisisProtocols.userId, ctx.userId),
        ),
      )
      .returning();

    if (row) return row;
  }

  const [row] = await db
    .insert(crisisProtocols)
    .values({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      title,
      steps,
    })
    .returning();

  if (!row) throw new Error('No se pudo guardar el protocolo.');
  return row;
}

export async function listCrisisProtocols(
  ctx: TenantContext,
  onlyActive = false,
): Promise<CrisisProtocolRow[]> {
  assertTenantContext(ctx, 'listCrisisProtocols');

  return db
    .select()
    .from(crisisProtocols)
    .where(
      and(
        eq(crisisProtocols.tenantId, ctx.tenantId),
        eq(crisisProtocols.userId, ctx.userId),
        ...(onlyActive ? [eq(crisisProtocols.active, true)] : []),
      ),
    )
    .orderBy(desc(crisisProtocols.updatedAt));
}

export async function setProtocolActive(
  ctx: TenantContext,
  protocolId: string,
  active: boolean,
): Promise<void> {
  assertTenantContext(ctx, 'setProtocolActive');

  await db
    .update(crisisProtocols)
    .set({ active, updatedAt: new Date() })
    .where(
      and(
        eq(crisisProtocols.id, protocolId),
        eq(crisisProtocols.tenantId, ctx.tenantId),
        eq(crisisProtocols.userId, ctx.userId),
      ),
    );
}

export async function deleteCrisisProtocol(
  ctx: TenantContext,
  protocolId: string,
): Promise<void> {
  assertTenantContext(ctx, 'deleteCrisisProtocol');

  await db
    .delete(crisisProtocols)
    .where(
      and(
        eq(crisisProtocols.id, protocolId),
        eq(crisisProtocols.tenantId, ctx.tenantId),
        eq(crisisProtocols.userId, ctx.userId),
      ),
    );
}
