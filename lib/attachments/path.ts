/**
 * La única forma de ruta de adjunto que se acepta guardar.
 *
 * Cualquier columna que guarde «dónde está este archivo» y después se pinte
 * como `<img src>` o como enlace tiene que pasar por aquí. Si no, escribir esa
 * columna equivale a escribir una URL arbitraria en la pantalla de otra
 * persona: una imagen remota le cuenta al servidor que la sirve cuándo se abre
 * la página y desde dónde, y un enlace remoto es una vía de phishing.
 *
 * Solo se admiten rutas a `/api/adjuntos/<uuid>`, que es nuestra ruta privada y
 * comprueba el tenant en cada petición. Nunca una URL del almacén: esa sería un
 * enlace público al archivo de alguien.
 *
 * Vive aparte porque lo necesitan las imágenes de los pasos de rutina y los
 * documentos de cédula profesional, y duplicar la comprobación garantiza que
 * algún día solo uno de los dos se corrija.
 */

const RUTA_DE_ADJUNTO = /^\/api\/adjuntos\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** La ruta si es válida, `null` si no. Nunca lanza: quien llama decide. */
export function safeAttachmentPath(
  value: string | null | undefined,
): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return RUTA_DE_ADJUNTO.test(trimmed) ? trimmed : null;
}
