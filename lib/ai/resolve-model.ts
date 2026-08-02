/**
 * Qué modelo usa cada tenant, para cada propósito. Fase 9.
 *
 * `lib/ai/provider.ts` sigue siendo el único sitio donde se crea el proveedor;
 * esto solo decide **qué identificador** se le pide, leyendo `model_configs`.
 *
 * ## El orden de precedencia, y por qué
 *
 * 1. La fila del tenant.
 * 2. La fila global de la plataforma.
 * 3. La variable de entorno.
 * 4. El valor del código.
 *
 * Los dos primeros escalones se editan desde el panel sin desplegar, que es lo
 * que pide la Fase 9. Los dos últimos existen para que la aplicación arranque
 * con la base recién creada y para que un error en el panel no deje el chat
 * inservible: siempre queda un modelo debajo.
 *
 * ## La caché
 *
 * Se cachea en KV cinco minutos, igual que los prompts. Sin ella cada mensaje
 * pagaría una consulta a Postgres antes de escribir una sola palabra. Si KV no
 * está o falla, se lee de la base y la aplicación sigue: la caché es un lujo,
 * no un requisito.
 *
 * Cambiar un modelo desde el panel tarda hasta cinco minutos en verse en todas
 * las instancias. Es aceptable para un cambio de configuración, y está anotado
 * en la interfaz para que nadie crea que no se guardó.
 */
import { getModelConfig } from '../db/repositories/billing';
import { kvGet, kvSet } from '../kv';
import { CHAT_MODEL_ID, UTILITY_MODEL_ID } from './provider';
import type { ModelPurpose } from '../billing/types';

const CACHE_PREFIX = 'model:';
export const MODEL_CACHE_TTL_SECONDS = 300;

/** El respaldo del entorno y del código para cada propósito. */
export function fallbackModelId(purpose: ModelPurpose): string {
  switch (purpose) {
    case 'chat':
      return CHAT_MODEL_ID;
    case 'crisis':
      // Sin configuración propia, el módulo de crisis usa el de conversación.
      return CHAT_MODEL_ID;
    case 'utilidad':
      return UTILITY_MODEL_ID;
    case 'embeddings':
      return process.env.CIAN_EMBEDDING_MODEL?.trim() || 'gemini-embedding-001';
  }
}

export async function resolveModelId(
  tenantId: string | null,
  purpose: ModelPurpose,
): Promise<string> {
  const cacheKey = `${CACHE_PREFIX}${tenantId ?? 'global'}:${purpose}`;

  const cached = await kvGet<string>(cacheKey);
  if (typeof cached === 'string' && cached.length > 0) return cached;

  let model = fallbackModelId(purpose);

  try {
    const config = await getModelConfig(tenantId, purpose);
    if (config?.model) model = config.model;
  } catch {
    // Una base inalcanzable no puede dejar sin modelo a nadie.
  }

  await kvSet(cacheKey, model, MODEL_CACHE_TTL_SECONDS);

  return model;
}

/** Se llama al guardar en el panel, para que el cambio se note ya. */
export async function invalidateModelCache(
  tenantId: string | null,
  purpose: ModelPurpose,
): Promise<void> {
  await kvSet(`${CACHE_PREFIX}${tenantId ?? 'global'}:${purpose}`, '', 1);
}
