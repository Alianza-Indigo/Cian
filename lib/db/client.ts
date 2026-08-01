/**
 * Cliente de base de datos.
 *
 * La instancia se crea de forma perezosa: importar este modulo no debe abrir
 * conexiones ni exigir `POSTGRES_URL`. Eso permite compilar y correr pruebas
 * sin base de datos, y evita que el build de Next falle al recolectar rutas.
 */
import { sql } from '@vercel/postgres';
import { drizzle, type VercelPgDatabase } from 'drizzle-orm/vercel-postgres';
import * as schema from './schema/index';

type Database = VercelPgDatabase<typeof schema>;

let instance: Database | null = null;

export function getDb(): Database {
  if (!instance) {
    instance = drizzle(sql, { schema });
  }
  return instance;
}

/**
 * Acceso ergonomico al cliente. Se resuelve en el primer uso real, no al
 * importar. Las funciones de repositorio son las unicas que deberian usarlo:
 * ningun componente ni route handler toca `db` directamente (regla 3.1).
 */
export const db: Database = new Proxy({} as Database, {
  get(_target, property, receiver) {
    const value = Reflect.get(getDb(), property, receiver) as unknown;
    return typeof value === 'function' ? value.bind(getDb()) : value;
  },
});

export type { Database };
