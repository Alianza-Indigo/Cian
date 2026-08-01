/**
 * Modelo de lenguaje de CIAN.
 *
 * El proveedor está aquí y en ningún otro lado. Cuando la Fase 9 traiga
 * `model_configs` (modelo por tenant y por propósito), este módulo pasa a leer
 * de esa tabla y nada más cambia.
 *
 * Decisión registrada en docs/DECISIONS.md.
 */
import { google } from '@ai-sdk/google';

const DEFAULT_MODEL_ID = 'gemini-3.1-flash-lite-preview';

const MODEL_ALIASES: Record<string, string> = {
  'gemini-3.1-flash-lite': 'gemini-3.1-flash-lite-preview',
};

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
  const modelId =
    typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : DEFAULT_MODEL_ID;

  return MODEL_ALIASES[modelId] ?? modelId;
}

/** Conversación con el orquestador. */
export const CHAT_MODEL_ID = modelIdFromEnv('CIAN_CHAT_MODEL');

/** Tareas cortas de apoyo, como titular una conversación. */
export const UTILITY_MODEL_ID = modelIdFromEnv('CIAN_UTILITY_MODEL');

export function chatModel() {
  return google(CHAT_MODEL_ID);
}

export function utilityModel() {
  return google(UTILITY_MODEL_ID);
}

/**
 * `@ai-sdk/google` lee `GOOGLE_GENERATIVE_AI_API_KEY`. Se comprueba aquí para
 * poder dar un mensaje entendible en vez de un fallo del proveedor.
 */
export function isModelConfigured(): boolean {
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  return typeof key === 'string' && key.trim().length > 0;
}
