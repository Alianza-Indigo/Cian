/**
 * Lectura de prompts versionados. Regla 3.5 del PRD.
 *
 * Los prompts viven en la tabla `prompts` y se editan desde el panel
 * administrativo sin redeploy. Para no pagar una consulta a Postgres en cada
 * mensaje, la versión activa se cachea en Vercel KV.
 *
 * La caché es un lujo, no un requisito: si KV no está configurado o falla, se
 * lee de Postgres y la aplicación sigue funcionando.
 */
import { getActivePrompt } from '../db/repositories/prompts';
import { kvGet, kvSet } from '../kv';

const CACHE_PREFIX = 'prompt:';
const CACHE_TTL_SECONDS = 300;

export async function getPromptContent(key: string): Promise<string | null> {
  const cacheKey = `${CACHE_PREFIX}${key}`;

  const cached = await kvGet<string>(cacheKey);
  if (typeof cached === 'string' && cached.length > 0) {
    return cached;
  }

  const row = await getActivePrompt(key);
  if (!row) return null;

  await kvSet(cacheKey, row.content, CACHE_TTL_SECONDS);

  return row.content;
}

/**
 * Igual que `getPromptContent`, pero con un texto de respaldo si la clave no
 * existe todavía en la base. Evita que un seed incompleto deje al asistente
 * sin identidad ni barandales.
 */
export async function getPromptOrFallback(
  key: string,
  fallback: string,
): Promise<string> {
  try {
    const content = await getPromptContent(key);
    return content ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * Respaldo mínimo del orquestador. La versión completa vive en
 * `prompts/seed/orchestrator.system.md` y se carga en cada build.
 *
 * Este texto existe solo para que, ante una base inalcanzable, el asistente
 * no pierda los límites que lo hacen seguro.
 */
export const ORCHESTRATOR_FALLBACK = `Eres el asistente de CIAN, de Alianza Índigo Neurodivergente A.C.
Acompañas a personas neurodivergentes, sus familias, cuidadores y profesionales.
Hablas en español de México, con calidez y sin condescendencia.
Nunca diagnosticas, nunca sugieres medicación y nunca sustituyes atención profesional.
Ante riesgo de vida o lesión grave, diriges a servicios de emergencia de inmediato.`;
