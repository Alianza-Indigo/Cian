import type { UIMessage } from 'ai';
import type { MessageRow } from '../db/schema/chat';

/**
 * Convierte las filas guardadas al formato que espera el cliente.
 *
 * Los mensajes se guardan con las `parts` del AI SDK tal cual, así que
 * restaurar una conversación es leer y devolver: no hay reconstrucción que
 * pueda perder información por el camino.
 */
export function toUIMessages(rows: MessageRow[]): UIMessage[] {
  return rows.map(
    (row) =>
      ({
        id: row.id,
        role: row.role,
        parts: row.parts,
      }) as UIMessage,
  );
}
