/**
 * Acceso a Vercel KV con degradación elegante.
 *
 * KV se usa para caché de prompts y para el límite de uso. Ninguna de las dos
 * cosas debe poder tumbar la aplicación: si el store no está configurado o
 * responde con error, las funciones devuelven `null` y quien llama decide.
 *
 * El módulo envuelve al cliente en lugar de exponerlo para que cambiar de
 * proveedor de Redis sea un cambio de un solo archivo. Ver la nota sobre
 * `@vercel/kv` en docs/NOTES.md.
 */
import { kv } from '@vercel/kv';

let warned = false;

/** KV necesita estas variables; sin ellas el cliente lanza al primer uso. */
export function isKvConfigured(): boolean {
  return Boolean(
    process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN,
  );
}

function warnOnce(): void {
  if (warned) return;
  warned = true;
  console.warn(
    '[kv] Sin store de KV configurado: la caché de prompts y el límite de uso ' +
      'quedan desactivados. Conecta un store de Redis al proyecto en Vercel.',
  );
}

export async function kvGet<T>(key: string): Promise<T | null> {
  if (!isKvConfigured()) {
    warnOnce();
    return null;
  }

  try {
    return await kv.get<T>(key);
  } catch {
    return null;
  }
}

export async function kvSet(
  key: string,
  value: unknown,
  ttlSeconds?: number,
): Promise<void> {
  if (!isKvConfigured()) {
    warnOnce();
    return;
  }

  try {
    if (ttlSeconds && ttlSeconds > 0) {
      await kv.set(key, value, { ex: ttlSeconds });
    } else {
      await kv.set(key, value);
    }
  } catch {
    // La caché nunca es motivo para fallar una petición.
  }
}

/**
 * Incremento con expiración, en una sola ida y vuelta. Devuelve `null` si KV
 * no está disponible, para que quien llama distinga «no sé» de «cero».
 */
export async function kvIncrementWithTtl(
  key: string,
  ttlSeconds: number,
): Promise<number | null> {
  if (!isKvConfigured()) {
    warnOnce();
    return null;
  }

  try {
    const value = await kv.incr(key);
    if (value === 1) {
      await kv.expire(key, ttlSeconds);
    }
    return value;
  } catch {
    return null;
  }
}
