import { and, desc, eq } from 'drizzle-orm';
import { db } from '../client';
import { prompts, type PromptRow } from '../schema/prompts';
import {
  assertRoleAtLeast,
  assertTenantContext,
  type TenantContext,
} from '../../tenant/guard';

/**
 * Lectura del prompt activo por clave. Regla 3.5.
 *
 * En Fase 1 esta lectura se cachea en Vercel KV; por ahora va directo a
 * Postgres. El contrato de la funcion no cambia cuando se agregue la cache.
 */
export async function getActivePrompt(key: string): Promise<PromptRow | null> {
  if (typeof key !== 'string' || key.trim().length === 0) {
    throw new Error('getActivePrompt: se requiere una clave de prompt.');
  }

  const [row] = await db
    .select()
    .from(prompts)
    .where(and(eq(prompts.key, key), eq(prompts.isActive, true)))
    .orderBy(desc(prompts.version))
    .limit(1);

  return row ?? null;
}

/** Historial de versiones de una clave. Panel administrativo, Fase 9. */
export async function listPromptVersions(
  ctx: TenantContext,
  key: string,
): Promise<PromptRow[]> {
  assertRoleAtLeast(ctx, 'admin', 'listPromptVersions');

  return db
    .select()
    .from(prompts)
    .where(eq(prompts.key, key))
    .orderBy(desc(prompts.version));
}

/**
 * Activa una version concreta y desactiva las demas de la misma clave, en una
 * sola transaccion. Es la operacion que hace posible el rollback de Fase 9.
 */
export async function activatePromptVersion(
  ctx: TenantContext,
  key: string,
  version: number,
): Promise<PromptRow> {
  assertRoleAtLeast(ctx, 'admin', 'activatePromptVersion');
  assertTenantContext(ctx, 'activatePromptVersion');

  return db.transaction(async (tx) => {
    await tx
      .update(prompts)
      .set({ isActive: false })
      .where(eq(prompts.key, key));

    const [row] = await tx
      .update(prompts)
      .set({ isActive: true })
      .where(and(eq(prompts.key, key), eq(prompts.version, version)))
      .returning();

    if (!row) {
      throw new Error(
        `No existe la version ${version} del prompt "${key}".`,
      );
    }

    return row;
  });
}
