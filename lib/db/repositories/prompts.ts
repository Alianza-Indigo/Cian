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

/** Todas las claves de prompt que existen, con su versión activa. */
export async function listPromptKeys(
  ctx: TenantContext,
): Promise<Array<{ key: string; activeVersion: number | null; versions: number }>> {
  assertRoleAtLeast(ctx, 'admin', 'listPromptKeys');

  const rows = await db.select().from(prompts).orderBy(desc(prompts.version));

  const byKey = new Map<
    string,
    { key: string; activeVersion: number | null; versions: number }
  >();

  for (const row of rows) {
    const entry = byKey.get(row.key) ?? {
      key: row.key,
      activeVersion: null,
      versions: 0,
    };

    entry.versions += 1;
    if (row.isActive) entry.activeVersion = row.version;
    byKey.set(row.key, entry);
  }

  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key, 'es'));
}

/**
 * Guarda una versión nueva de un prompt y la activa.
 *
 * Nunca modifica una versión existente: **el historial es inmutable**, que es
 * lo que hace posible el rollback del criterio de la Fase 9. Editar en sitio
 * dejaría un historial que miente sobre lo que el asistente dijo cuando lo
 * dijo.
 *
 * Si el contenido es idéntico al de la versión activa, no crea nada: repetir
 * versiones iguales convierte el historial en ruido.
 */
export async function createPromptVersion(
  ctx: TenantContext,
  key: string,
  content: string,
): Promise<{ created: boolean; row: PromptRow }> {
  assertRoleAtLeast(ctx, 'admin', 'createPromptVersion');

  const trimmed = content.trim();
  if (trimmed.length === 0) throw new Error('El prompt no puede quedar vacío.');

  return db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(prompts)
      .where(eq(prompts.key, key))
      .orderBy(desc(prompts.version));

    const active = existing.find((row) => row.isActive);
    if (active && active.content.trim() === trimmed) {
      return { created: false, row: active };
    }

    const nextVersion = (existing[0]?.version ?? 0) + 1;

    await tx.update(prompts).set({ isActive: false }).where(eq(prompts.key, key));

    const [row] = await tx
      .insert(prompts)
      .values({ key, version: nextVersion, content: trimmed, isActive: true })
      .returning();

    if (!row) throw new Error('No se pudo guardar el prompt.');
    return { created: true, row };
  });
}
