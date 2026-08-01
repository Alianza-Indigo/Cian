/**
 * Título automático de la conversación.
 *
 * Se genera del primer intercambio y se despacha con `waitUntil`: la persona
 * ya tiene su respuesta, el título puede tardar un segundo más (regla 3.3).
 */
import { generateText } from 'ai';
import { utilityModel, UTILITY_MODEL_ID } from './provider';
import { setAutoTitle } from '../db/repositories/conversations';
import { recordUsage } from '../db/repositories/usage';
import type { TenantContext } from '../tenant/guard';

const TITLE_PROMPT = `Escribe un título breve para esta conversación.

Reglas:
- Máximo 6 palabras.
- En español de México.
- Sin comillas, sin punto final, sin la palabra "conversación".
- Describe el tema, no el tono. Nada de "consulta sobre" ni "ayuda con".
- Si el mensaje es un saludo sin tema, responde: Conversación nueva

Responde únicamente con el título.`;

/** Recorta a algo que quepa en la barra lateral sin cortar una palabra. */
function tidyTitle(raw: string): string {
  const cleaned = raw
    .replace(/^["'«»\s]+|["'«»\s.]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleaned.length <= 60) return cleaned;
  return `${cleaned.slice(0, 57).replace(/\s+\S*$/, '')}…`;
}

export async function generateConversationTitle(
  ctx: TenantContext,
  conversationId: string,
  firstUserMessage: string,
): Promise<void> {
  const source = firstUserMessage.trim().slice(0, 1500);
  if (source.length === 0) return;

  try {
    const result = await generateText({
      model: utilityModel(),
      system: TITLE_PROMPT,
      prompt: source,
      maxOutputTokens: 32,
    });

    const title = tidyTitle(result.text);
    if (title.length === 0) return;

    await setAutoTitle(ctx, conversationId, title);

    await recordUsage(ctx, {
      kind: 'title',
      model: UTILITY_MODEL_ID,
      tokensIn: result.usage.inputTokens ?? 0,
      tokensOut: result.usage.outputTokens ?? 0,
    });
  } catch {
    // Quedarse sin título es cosmético: la conversación sigue siendo usable.
  }
}

export { tidyTitle as __tidyTitleForTests };
