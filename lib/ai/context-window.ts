/**
 * Recorte de la ventana de conversación.
 *
 * Criterio de aceptación: «una conversación de 40 mensajes se mantiene
 * coherente y no rompe por longitud de contexto».
 *
 * La estrategia: conservar los mensajes más recientes que quepan en el
 * presupuesto, sin partir ninguno por la mitad, y garantizar siempre el último
 * turno de la persona. Un mensaje cortado a la mitad confunde más al modelo
 * que su ausencia.
 */
import type { UIMessage } from 'ai';

/**
 * Presupuesto de historia en tokens. Gemini admite mucho más, pero cada token
 * enviado se paga en cada turno: la conversación entera se reenvía siempre.
 */
export const HISTORY_TOKEN_BUDGET = 24_000;

/** Siempre se conservan al menos estos turnos, quepan o no en el presupuesto. */
const MIN_MESSAGES_KEPT = 2;

/**
 * Estimación por caracteres. No es exacta y no pretende serlo: sirve para
 * decidir qué recortar, y el conteo real de consumo lo reporta el proveedor
 * en `usage` al terminar.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function messageText(message: UIMessage): string {
  return message.parts
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join(' ');
}

export function estimateMessageTokens(message: UIMessage): number {
  // Unos pocos tokens de sobrecarga por mensaje (rol, delimitadores).
  return estimateTokens(messageText(message)) + 4;
}

/**
 * Devuelve la cola más larga de la conversación que cabe en el presupuesto.
 * El orden original se conserva.
 */
export function trimToBudget(
  messages: UIMessage[],
  budget = HISTORY_TOKEN_BUDGET,
): UIMessage[] {
  if (messages.length <= MIN_MESSAGES_KEPT) return messages;

  const kept: UIMessage[] = [];
  let used = 0;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message) continue;

    const cost = estimateMessageTokens(message);

    if (used + cost > budget && kept.length >= MIN_MESSAGES_KEPT) {
      break;
    }

    kept.push(message);
    used += cost;
  }

  return kept.reverse();
}
