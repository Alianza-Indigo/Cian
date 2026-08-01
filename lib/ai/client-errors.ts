/**
 * Presentación de errores del chat en el cliente.
 *
 * Cuando la ruta responde con un JSON de error en vez de un flujo, el AI SDK
 * entrega el cuerpo crudo como mensaje del `Error`. Mostrarlo tal cual pone
 * `{"error":"..."}` delante de la persona, que es justo lo que no debe pasar.
 */

const FALLBACK = 'No pudimos completar la respuesta. Vuelve a intentarlo.';

export function humanizeChatError(error: Error | undefined): string {
  if (!error) return FALLBACK;

  const raw = error.message?.trim();
  if (!raw) return FALLBACK;

  // Cuerpo JSON de nuestras propias respuestas de error.
  if (raw.startsWith('{')) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'error' in parsed &&
        typeof (parsed as { error: unknown }).error === 'string'
      ) {
        return (parsed as { error: string }).error;
      }
    } catch {
      // No era JSON: se cae al texto tal cual.
    }
  }

  // Mensajes técnicos del transporte no le dicen nada a nadie.
  if (/^(failed to fetch|network|load failed)/i.test(raw)) {
    return 'Se perdió la conexión. Revisa tu internet y vuelve a intentarlo.';
  }

  return raw;
}
