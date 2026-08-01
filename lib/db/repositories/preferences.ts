import { and, eq } from 'drizzle-orm';
import { db } from '../client';
import { userPreferences, type UserPreferencesRow } from '../schema/preferences';
import {
  DEFAULT_PREFERENCES,
  clampTextScale,
  type EffectivePreferences,
  type PreferencesPatch,
} from '../../preferences/types';
import { assertTenantContext, type TenantContext } from '../../tenant/guard';

export type { EffectivePreferences, PreferencesPatch };
export { DEFAULT_PREFERENCES };

export async function getPreferences(
  ctx: TenantContext,
): Promise<UserPreferencesRow | null> {
  assertTenantContext(ctx, 'getPreferences');

  const [row] = await db
    .select()
    .from(userPreferences)
    .where(
      and(
        eq(userPreferences.tenantId, ctx.tenantId),
        eq(userPreferences.userId, ctx.userId),
      ),
    )
    .limit(1);

  return row ?? null;
}

/** Preferencias listas para pintar: fila guardada o valores por defecto. */
export async function getEffectivePreferences(
  ctx: TenantContext,
): Promise<EffectivePreferences> {
  assertTenantContext(ctx, 'getEffectivePreferences');

  const row = await getPreferences(ctx);
  if (!row) return { ...DEFAULT_PREFERENCES };

  return {
    density: row.density,
    textScale: row.textScale,
    reducedMotion: row.reducedMotion,
    theme: row.theme,
    detailLevel: row.detailLevel,
  };
}

/**
 * Inserta o actualiza las preferencias de la persona dentro de su tenant.
 * El conflicto se resuelve sobre `(tenant_id, user_id)`, por lo que guardar
 * dos veces desde dos pestanas no duplica filas.
 */
export async function upsertPreferences(
  ctx: TenantContext,
  patch: PreferencesPatch,
): Promise<UserPreferencesRow> {
  assertTenantContext(ctx, 'upsertPreferences');

  const normalized: PreferencesPatch = {
    ...patch,
    ...(patch.textScale === undefined
      ? {}
      : { textScale: clampTextScale(patch.textScale) }),
  };

  const [row] = await db
    .insert(userPreferences)
    .values({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      ...normalized,
    })
    .onConflictDoUpdate({
      target: [userPreferences.tenantId, userPreferences.userId],
      set: { ...normalized, updatedAt: new Date() },
    })
    .returning();

  if (!row) {
    throw new Error('No se pudieron guardar las preferencias.');
  }

  return row;
}
