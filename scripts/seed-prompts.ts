/**
 * Carga los prompts de `prompts/seed/` a la tabla `prompts`.
 *
 * Idempotente y versionado (regla 3.5):
 *   - El nombre del archivo es la clave: `orchestrator.system.md` → `orchestrator.system`.
 *   - Si el contenido ya esta guardado y activo, no hace nada.
 *   - Si cambio, inserta una version nueva y desactiva las anteriores.
 *
 * Nunca borra versiones: el historial es lo que hace posible el rollback del
 * panel administrativo en la Fase 9.
 *
 * Uso: pnpm db:seed
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '../lib/db/client';
import { prompts } from '../lib/db/schema/prompts';

const SEED_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'prompts',
  'seed',
);

async function main(): Promise<void> {
  if (!process.env.POSTGRES_URL) {
    throw new Error(
      'Falta POSTGRES_URL. Copia .env.example a .env.local y vuelve a intentarlo.',
    );
  }

  const db = getDb();
  const files = readdirSync(SEED_DIR).filter((file) => file.endsWith('.md'));

  if (files.length === 0) {
    console.log('No hay prompts que cargar en prompts/seed/.');
    return;
  }

  for (const file of files) {
    const key = file.replace(/\.md$/, '');
    const content = readFileSync(join(SEED_DIR, file), 'utf8').trim();

    const [active] = await db
      .select()
      .from(prompts)
      .where(and(eq(prompts.key, key), eq(prompts.isActive, true)))
      .limit(1);

    if (active && active.content.trim() === content) {
      console.log(`= ${key} v${active.version} — sin cambios`);
      continue;
    }

    const [latest] = await db
      .select({ version: prompts.version })
      .from(prompts)
      .where(eq(prompts.key, key))
      .orderBy(desc(prompts.version))
      .limit(1);

    const nextVersion = (latest?.version ?? 0) + 1;

    await db.transaction(async (tx) => {
      await tx
        .update(prompts)
        .set({ isActive: false })
        .where(eq(prompts.key, key));

      await tx.insert(prompts).values({
        key,
        version: nextVersion,
        content,
        isActive: true,
      });
    });

    console.log(`+ ${key} v${nextVersion} — activado`);
  }
}

await main();
