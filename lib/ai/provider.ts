/**
 * Modelo de lenguaje de CIAN.
 *
 * El proveedor está aquí y en ningún otro lado. Cuando la Fase 9 traiga
 * `model_configs` (modelo por tenant y por propósito), este módulo pasa a leer
 * de esa tabla y nada más cambia.
 *
 * Decisión registrada en docs/DECISIONS.md.
 */
import { createGoogle } from '@ai-sdk/google';

const DEFAULT_MODEL_ID = 'gemini-3.1-flash-lite';
const GOOGLE_API_KEY_ENV_NAMES = [
  'GOOGLE_GENERATIVE_AI_API_KEY',
  'GEMINI_API_KEY',
  'GOOGLE_API_KEY',
] as const;

/**
 * El identificador se puede sobrescribir por entorno.
 *
 * Los nombres de modelo cambian con más frecuencia que el código, y un
 * identificador equivocado deja el chat inservible. Poder corregirlo desde
 * Vercel evita esperar a un despliegue. El valor por defecto sigue siendo el
 * que fija la decisión de arquitectura.
 */
function modelIdFromEnv(variable: string): string {
  const value = process.env[variable];
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : DEFAULT_MODEL_ID;
}

/** Conversación con el orquestador. */
export const CHAT_MODEL_ID = modelIdFromEnv('CIAN_CHAT_MODEL');

/** Tareas cortas de apoyo, como titular una conversación. */
export const UTILITY_MODEL_ID = modelIdFromEnv('CIAN_UTILITY_MODEL');

function googleApiKeyFromEnv(): string | undefined {
  for (const name of GOOGLE_API_KEY_ENV_NAMES) {
    const value = process.env[name];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  return undefined;
}

function googleProvider() {
  const apiKey = googleApiKeyFromEnv();
  if (!apiKey) {
    throw new Error(
      `Google Generative AI API key is missing. Set ${GOOGLE_API_KEY_ENV_NAMES.join(
        ', ',
      )}.`,
    );
  }

  return createGoogle({ apiKey });
}

/**
 * El modelo de conversación.
 *
 * Acepta un identificador explícito desde la Fase 9: `lib/ai/resolve-model.ts`
 * lo saca de `model_configs` y lo pasa aquí. Sin argumento se usa el del
 * entorno, que es lo que hacen las rutas que todavía no resuelven por tenant.
 */
export function chatModel(modelId: string = CHAT_MODEL_ID) {
  return googleProvider()(modelId);
}

export function utilityModel(modelId: string = UTILITY_MODEL_ID) {
  return googleProvider()(modelId);
}

/**
 * `@ai-sdk/google` lee `GOOGLE_GENERATIVE_AI_API_KEY`, mientras que la
 * documentación de Gemini suele nombrar la clave como `GEMINI_API_KEY` o
 * `GOOGLE_API_KEY`. CIAN acepta las tres y descarta valores vacíos.
 */
export function isModelConfigured(): boolean {
  return googleApiKeyFromEnv() != null;
}

export const __googleApiKeyEnvNamesForTests = GOOGLE_API_KEY_ENV_NAMES;
