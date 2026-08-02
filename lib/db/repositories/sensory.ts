import { and, desc, eq } from 'drizzle-orm';
import { db } from '../client';
import {
  sensoryEvents,
  sensoryProfiles,
  sensoryTools,
  type SensoryEventRow,
  type SensoryProfileRow,
  type SensoryToolRow,
} from '../schema/daily-life';
import { assertTenantContext, type TenantContext } from '../../tenant/guard';
import {
  INTENSITY_MAX,
  INTENSITY_MIN,
  type EventOutcome,
  type SensitivityLevel,
  type SensoryDomain,
} from '../../sensory/types';

export type UpdateSensoryProfileInput = {
  domain: SensoryDomain;
  sensitivity?: SensitivityLevel;
  triggers?: string[];
  strategies?: string[];
  notes?: string | null;
};

function cleanList(values: string[] | undefined, max = 30): string[] | undefined {
  if (!values) return undefined;
  return [
    ...new Set(
      values
        .map((value) => value.trim().slice(0, 300))
        .filter((value) => value.length > 0),
    ),
  ].slice(0, max);
}

export async function listSensoryProfiles(
  ctx: TenantContext,
): Promise<SensoryProfileRow[]> {
  assertTenantContext(ctx, 'listSensoryProfiles');

  return db
    .select()
    .from(sensoryProfiles)
    .where(
      and(
        eq(sensoryProfiles.tenantId, ctx.tenantId),
        eq(sensoryProfiles.userId, ctx.userId),
      ),
    );
}

export async function getSensoryProfile(
  ctx: TenantContext,
  domain: SensoryDomain,
): Promise<SensoryProfileRow | null> {
  assertTenantContext(ctx, 'getSensoryProfile');

  const [row] = await db
    .select()
    .from(sensoryProfiles)
    .where(
      and(
        eq(sensoryProfiles.tenantId, ctx.tenantId),
        eq(sensoryProfiles.userId, ctx.userId),
        eq(sensoryProfiles.domain, domain),
      ),
    )
    .limit(1);

  return row ?? null;
}

/**
 * Actualiza el perfil de un dominio.
 *
 * Los disparadores y las estrategias se **acumulan**, no se reemplazan: lo que
 * ya funcionaba no debe perderse porque una conversación posterior mencione
 * solo una parte.
 */
export async function updateSensoryProfile(
  ctx: TenantContext,
  input: UpdateSensoryProfileInput,
): Promise<SensoryProfileRow> {
  assertTenantContext(ctx, 'updateSensoryProfile');

  const existing = await getSensoryProfile(ctx, input.domain);

  const triggers = cleanList(input.triggers);
  const strategies = cleanList(input.strategies);

  const mergedTriggers = triggers
    ? cleanList([...(existing?.triggers ?? []), ...triggers])
    : existing?.triggers;
  const mergedStrategies = strategies
    ? cleanList([...(existing?.strategies ?? []), ...strategies])
    : existing?.strategies;

  const [row] = await db
    .insert(sensoryProfiles)
    .values({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      domain: input.domain,
      ...(input.sensitivity ? { sensitivity: input.sensitivity } : {}),
      triggers: mergedTriggers ?? [],
      strategies: mergedStrategies ?? [],
      notes: input.notes?.trim() || null,
    })
    .onConflictDoUpdate({
      target: [
        sensoryProfiles.tenantId,
        sensoryProfiles.userId,
        sensoryProfiles.domain,
      ],
      set: {
        ...(input.sensitivity ? { sensitivity: input.sensitivity } : {}),
        ...(mergedTriggers ? { triggers: mergedTriggers } : {}),
        ...(mergedStrategies ? { strategies: mergedStrategies } : {}),
        ...(input.notes !== undefined
          ? { notes: input.notes?.trim() || null }
          : {}),
        updatedAt: new Date(),
      },
    })
    .returning();

  if (!row) throw new Error('No se pudo guardar el perfil sensorial.');
  return row;
}

/** Quita un disparador o una estrategia del perfil. */
export async function removeFromSensoryProfile(
  ctx: TenantContext,
  domain: SensoryDomain,
  field: 'triggers' | 'strategies',
  value: string,
): Promise<SensoryProfileRow | null> {
  assertTenantContext(ctx, 'removeFromSensoryProfile');

  const existing = await getSensoryProfile(ctx, domain);
  if (!existing) return null;

  const next = existing[field].filter((item) => item !== value);

  const [row] = await db
    .update(sensoryProfiles)
    .set({ [field]: next, updatedAt: new Date() })
    .where(
      and(
        eq(sensoryProfiles.id, existing.id),
        eq(sensoryProfiles.tenantId, ctx.tenantId),
      ),
    )
    .returning();

  return row ?? null;
}

export type LogSensoryEventInput = {
  domain: SensoryDomain;
  intensity?: number | null;
  context?: string | null;
  strategyUsed?: string | null;
  outcome?: EventOutcome | null;
};

export async function logSensoryEvent(
  ctx: TenantContext,
  input: LogSensoryEventInput,
): Promise<SensoryEventRow> {
  assertTenantContext(ctx, 'logSensoryEvent');

  const intensity =
    input.intensity === null || input.intensity === undefined
      ? null
      : Math.min(INTENSITY_MAX, Math.max(INTENSITY_MIN, Math.round(input.intensity)));

  const [row] = await db
    .insert(sensoryEvents)
    .values({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      domain: input.domain,
      intensity,
      context: input.context?.trim().slice(0, 2000) || null,
      strategyUsed: input.strategyUsed?.trim().slice(0, 500) || null,
      outcome: input.outcome ?? null,
    })
    .returning();

  if (!row) throw new Error('No se pudo registrar el evento sensorial.');
  return row;
}

export async function listSensoryEvents(
  ctx: TenantContext,
  limit = 50,
): Promise<SensoryEventRow[]> {
  assertTenantContext(ctx, 'listSensoryEvents');

  return db
    .select()
    .from(sensoryEvents)
    .where(
      and(
        eq(sensoryEvents.tenantId, ctx.tenantId),
        eq(sensoryEvents.userId, ctx.userId),
      ),
    )
    .orderBy(desc(sensoryEvents.occurredAt))
    .limit(Math.min(Math.max(limit, 1), 200));
}

export async function addSensoryTool(
  ctx: TenantContext,
  input: {
    name: string;
    description?: string | null;
    domain?: SensoryDomain | null;
    effective?: boolean | null;
  },
): Promise<SensoryToolRow> {
  assertTenantContext(ctx, 'addSensoryTool');

  const name = input.name.trim().slice(0, 200);
  if (name.length === 0) throw new Error('La herramienta necesita un nombre.');

  const [row] = await db
    .insert(sensoryTools)
    .values({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      name,
      description: input.description?.trim().slice(0, 1000) || null,
      domain: input.domain ?? null,
      effective: input.effective ?? null,
    })
    .returning();

  if (!row) throw new Error('No se pudo guardar la herramienta.');
  return row;
}

export async function listSensoryTools(
  ctx: TenantContext,
): Promise<SensoryToolRow[]> {
  assertTenantContext(ctx, 'listSensoryTools');

  return db
    .select()
    .from(sensoryTools)
    .where(
      and(
        eq(sensoryTools.tenantId, ctx.tenantId),
        eq(sensoryTools.userId, ctx.userId),
      ),
    )
    .orderBy(desc(sensoryTools.createdAt));
}

export async function setToolEffective(
  ctx: TenantContext,
  toolId: string,
  effective: boolean | null,
): Promise<void> {
  assertTenantContext(ctx, 'setToolEffective');

  await db
    .update(sensoryTools)
    .set({ effective })
    .where(
      and(
        eq(sensoryTools.id, toolId),
        eq(sensoryTools.tenantId, ctx.tenantId),
        eq(sensoryTools.userId, ctx.userId),
      ),
    );
}

export async function deleteSensoryTool(
  ctx: TenantContext,
  toolId: string,
): Promise<void> {
  assertTenantContext(ctx, 'deleteSensoryTool');

  await db
    .delete(sensoryTools)
    .where(
      and(
        eq(sensoryTools.id, toolId),
        eq(sensoryTools.tenantId, ctx.tenantId),
        eq(sensoryTools.userId, ctx.userId),
      ),
    );
}
