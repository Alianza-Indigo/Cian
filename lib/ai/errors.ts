/**
 * Traducción de fallos del proveedor a mensajes para la persona.
 *
 * Dos reglas gobiernan este archivo:
 *
 * 1. **El detalle se registra en el servidor, nunca se manda al cliente**
 *    (regla 3.6). Un error del proveedor puede arrastrar fragmentos de la
 *    conversación, y aquí no hay forma de saber si los lleva.
 *
 * 2. **El mensaje dice de quién es el problema.** Si la falla es de
 *    configuración, quien escribe no tiene nada que reintentar, y decirle
 *    «vuelve a intentarlo» lo deja probando algo imposible.
 */

const GENERIC =
  'No pudimos completar la respuesta. Vuelve a intentarlo en un momento.';

const CONFIGURATION =
  'CIAN no puede conectarse con su modelo de lenguaje. Es un problema de configuración nuestro, no tuyo; ya estamos revisándolo.';

const QUOTA =
  'CIAN alcanzó su límite de uso con el proveedor del modelo. Es un problema nuestro; vuelve a intentarlo más tarde.';

const OVERLOADED =
  'El modelo está saturado en este momento. Espera unos segundos y vuelve a intentarlo.';

function describe(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return String(error);
}

/**
 * Devuelve el texto que verá la persona y deja el error real en los registros
 * del servidor, que es donde se puede consultar sin exponerlo.
 */
export function toUserFacingError(error: unknown): string {
  const detail = describe(error);

  // Queda en los logs de Vercel (Runtime), no en la respuesta.
  console.error('[chat] fallo del proveedor —', detail);

  const haystack = detail.toLowerCase();

  // Clave inválida, ausente o sin permisos sobre el modelo.
  if (
    haystack.includes('api key') ||
    haystack.includes('api_key') ||
    haystack.includes('unauthenticated') ||
    haystack.includes('permission_denied') ||
    haystack.includes('403')
  ) {
    return CONFIGURATION;
  }

  // Modelo inexistente o no disponible para esta clave.
  if (
    haystack.includes('not found') ||
    haystack.includes('not_found') ||
    haystack.includes('404') ||
    haystack.includes('is not supported')
  ) {
    return CONFIGURATION;
  }

  if (
    haystack.includes('quota') ||
    haystack.includes('resource_exhausted') ||
    haystack.includes('429')
  ) {
    return QUOTA;
  }

  if (
    haystack.includes('overloaded') ||
    haystack.includes('unavailable') ||
    haystack.includes('503')
  ) {
    return OVERLOADED;
  }

  return GENERIC;
}

export {
  GENERIC as GENERIC_CHAT_ERROR,
  CONFIGURATION as CONFIGURATION_CHAT_ERROR,
  QUOTA as QUOTA_CHAT_ERROR,
  OVERLOADED as OVERLOADED_CHAT_ERROR,
};
