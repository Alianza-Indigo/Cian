/**
 * Prepara la base de datos: aplica las migraciones pendientes y carga los
 * prompts de `prompts/seed/`.
 *
 * Corre en cada build (ver el script `build` de package.json), de modo que un
 * despliegue deja la base al día sin pasos manuales ni credenciales fuera de
 * Vercel.
 *
 * Es idempotente y seguro de repetir:
 *   - Drizzle lleva su propia tabla de control y solo aplica lo que falta.
 *   - Un prompt cuyo contenido no cambió no genera versión nueva.
 *   - Sin `POSTGRES_URL` no falla: avisa y se hace a un lado, para que la
 *     ausencia de base no rompa un build que por lo demás es válido.
 *
 * Uso manual: pnpm db:setup
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql as pool } from '@vercel/postgres';
import { drizzle } from 'drizzle-orm/vercel-postgres';
import { migrate } from 'drizzle-orm/vercel-postgres/migrator';
import { sql } from 'drizzle-orm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS_DIR = join(ROOT, 'lib', 'db', 'migrations');
const SEED_DIR = join(ROOT, 'prompts', 'seed');

if (!process.env.POSTGRES_URL) {
  console.warn(
    '[db-setup] Falta POSTGRES_URL: no se aplicaron migraciones ni se cargaron prompts.\n' +
      '[db-setup] Conecta el store de Postgres al proyecto en Vercel, o copia\n' +
      '[db-setup] .env.example a .env.local para trabajar en local.',
  );
  process.exit(0);
}

const db = drizzle(pool);

/*
 * pgvector tiene que existir ANTES de la migración que crea la columna
 * `vector`, y Drizzle no emite `CREATE EXTENSION` por su cuenta. Va aquí y no
 * dentro de un archivo de migración para que se aplique también en una base
 * que ya tenga migraciones anteriores.
 */
console.log('[db-setup] Asegurando la extensión pgvector…');
try {
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);
  console.log('[db-setup] pgvector disponible.');
} catch (error) {
  console.warn(
    '[db-setup] No se pudo habilitar pgvector:',
    error instanceof Error ? error.message : String(error),
  );
  console.warn(
    '[db-setup] La biblioteca de la Fase 6 necesita esta extensión. En Neon se\n' +
      '[db-setup] habilita sola; en otros Postgres puede requerir permisos de superusuario.',
  );
}

console.log('[db-setup] Aplicando migraciones…');
await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
console.log('[db-setup] Migraciones al día.');

console.log('[db-setup] Cargando prompts…');

const files = readdirSync(SEED_DIR)
  .filter((file) => file.endsWith('.md'))
  .sort();

for (const file of files) {
  const key = file.replace(/\.md$/, '');
  const content = readFileSync(join(SEED_DIR, file), 'utf8').trim();

  const active = await db.execute(
    sql`SELECT version, content FROM prompts WHERE key = ${key} AND is_active = true LIMIT 1`,
  );

  const current = active.rows[0];
  if (current && String(current.content).trim() === content) {
    console.log(`[db-setup] = ${key} v${current.version} — sin cambios`);
    continue;
  }

  const latest = await db.execute(
    sql`SELECT COALESCE(MAX(version), 0) AS version FROM prompts WHERE key = ${key}`,
  );
  const nextVersion = Number(latest.rows[0]?.version ?? 0) + 1;

  // Desactivar y activar en una transacción: nunca debe existir un instante
  // con dos versiones activas de la misma clave, ni con ninguna.
  await db.transaction(async (tx) => {
    await tx.execute(sql`UPDATE prompts SET is_active = false WHERE key = ${key}`);
    await tx.execute(
      sql`INSERT INTO prompts (key, version, content, is_active)
          VALUES (${key}, ${nextVersion}, ${content}, true)`,
    );
  });

  console.log(`[db-setup] + ${key} v${nextVersion} — activado`);
}

console.log('[db-setup] Listo.');
