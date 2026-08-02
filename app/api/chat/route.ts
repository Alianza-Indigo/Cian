/**
 * El orquestador. Regla 3.2 del PRD.
 *
 * Una sola ruta. El modelo recibe el registro de tools y decide qué usar; aquí
 * no hay palabras clave, ni clasificadores, ni ramas por intención. Agregar un
 * módulo en fases posteriores es registrar tools nuevas en `buildTools`, sin
 * tocar este archivo.
 *
 * Lo que sí vive aquí: identidad y ámbito de tenant, límite de uso,
 * persistencia y contabilidad de consumo.
 */
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type UIMessage,
} from 'ai';
import { waitUntil } from '@vercel/functions';
import { z } from 'zod';
import { getTenantContext } from '@/lib/tenant/context';
import { chatModel, CHAT_MODEL_ID } from '@/lib/ai/provider';
import { buildTools } from '@/lib/ai/tools';
import { getPromptOrFallback, ORCHESTRATOR_FALLBACK } from '@/lib/ai/prompts';
import { trimToBudget } from '@/lib/ai/context-window';
import { checkChatRateLimit } from '@/lib/ai/rate-limit';
import { generateConversationTitle } from '@/lib/ai/title';
import { logRawProviderError, toUserFacingError } from '@/lib/ai/errors';
import {
  ensureConversation,
  countMessages,
  touchConversation,
} from '@/lib/db/repositories/conversations';
import { appendMessage, deleteFromMessage } from '@/lib/db/repositories/messages';
import { attachToMessage } from '@/lib/db/repositories/attachments';
import {
  collectAttachmentIds,
  resolveAttachments,
} from '@/lib/attachments/resolve';
import { recordUsage } from '@/lib/db/repositories/usage';
import type { MessagePart } from '@/lib/db/schema/chat';

export const runtime = 'nodejs';

/**
 * Techo de duración. Debe caber en el plan de Vercel del proyecto: en Hobby el
 * máximo es 60 s. Subirlo por encima del techo del plan hace que la función
 * falle al desplegar, no en ejecución.
 */
export const maxDuration = 60;

/** Cuántos pasos de tool calling se permiten antes de cerrar el turno. */
const MAX_STEPS = 6;

const requestSchema = z.object({
  id: z.uuid(),
  messages: z.array(z.custom<UIMessage>()).min(1),
  /** Si viene, se borra ese mensaje y los siguientes: edición o reintento. */
  regenerateFromMessageId: z.string().min(1).max(200).optional(),
});

function textOf(message: UIMessage): string {
  return message.parts
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join('\n')
    .trim();
}

function errorResponse(message: string, status: number, extra?: HeadersInit) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extra },
  });
}

export async function POST(request: Request): Promise<Response> {
  const ctx = await getTenantContext();

  if (!ctx) {
    return errorResponse('Necesitas iniciar sesión para escribir.', 401);
  }

  let payload: z.infer<typeof requestSchema>;
  try {
    payload = requestSchema.parse(await request.json());
  } catch {
    return errorResponse('No entendimos la solicitud.', 400);
  }

  // El límite se comprueba antes de gastar un solo token.
  const limit = await checkChatRateLimit(ctx.tenantId, ctx.userId);
  if (!limit.allowed) {
    return errorResponse(limit.message, 429, {
      'Retry-After': String(limit.retryAfterSeconds),
    });
  }

  const conversation = await ensureConversation(ctx, payload.id);
  const conversationId = conversation.id;

  // Edición del último mensaje o reintento: la conversación vuelve al punto
  // anterior en vez de acumular intentos que después confunden al modelo.
  if (payload.regenerateFromMessageId) {
    await deleteFromMessage(ctx, conversationId, payload.regenerateFromMessageId);
  }

  const incoming = payload.messages[payload.messages.length - 1];
  if (!incoming || incoming.role !== 'user') {
    return errorResponse('El último mensaje debe ser tuyo.', 400);
  }

  const previousCount = await countMessages(ctx, conversationId);

  const userMessage = await appendMessage(ctx, {
    id: incoming.id,
    conversationId,
    role: 'user',
    parts: incoming.parts as MessagePart[],
  });

  // Los adjuntos se subieron antes de escribir; ahora quedan ligados a su
  // mensaje, que es lo que hace que sobrevivan al recargar la conversación.
  const attachmentIds = collectAttachmentIds([incoming]);
  if (attachmentIds.length > 0) {
    await attachToMessage(ctx, userMessage.id, attachmentIds);
  }

  const systemPrompt = await getPromptOrFallback(
    'orchestrator.system',
    ORCHESTRATOR_FALLBACK,
  );

  const history = trimToBudget(payload.messages);

  /*
   * Las partes de archivo apuntan a nuestra ruta privada, que el modelo no
   * puede descargar. Aquí se sustituyen por el contenido real: base64 para lo
   * que Gemini lee de forma nativa, texto extraído para Word y texto plano.
   */
  const withAttachments = await resolveAttachments(ctx, history);
  const modelMessages = await convertToModelMessages(withAttachments);

  const result = streamText({
    model: chatModel(),
    system: systemPrompt,
    messages: modelMessages,
    tools: buildTools({
      ctx,
      sourceMessageId: userMessage.id,
      conversationId,
    }),
    stopWhen: stepCountIs(MAX_STEPS),
    onError({ error }) {
      logRawProviderError(error);
    },
    onFinish({ usage }) {
      // Nada de esto debe retrasar la respuesta que ya está en pantalla.
      waitUntil(
        (async () => {
          try {
            await Promise.all([
              touchConversation(ctx, conversationId),
              recordUsage(ctx, {
                kind: 'chat',
                model: CHAT_MODEL_ID,
                tokensIn: usage.inputTokens ?? 0,
                tokensOut: usage.outputTokens ?? 0,
              }),
            ]);

            // Primer intercambio: la conversación estrena título.
            if (previousCount === 0) {
              await generateConversationTitle(
                ctx,
                conversationId,
                textOf(incoming),
              );
            }
          } catch {
            // La contabilidad no puede romper una conversación en curso.
          }
        })(),
      );
    },
  });

  return result.toUIMessageStreamResponse({
    originalMessages: payload.messages,
    /*
     * Sin esto, el AI SDK enmascara cualquier fallo del proveedor con un
     * "An error occurred" que no dice nada ni a la persona ni a quien depura.
     * El detalle real queda en los registros del servidor.
     */
    onError: toUserFacingError,
    // El mensaje del asistente se guarda cuando termina de escribirse, con
    // el mismo identificador que ya tiene el cliente.
    async onFinish({ responseMessage }) {
      try {
        await appendMessage(ctx, {
          id: responseMessage.id,
          conversationId,
          role: 'assistant',
          parts: responseMessage.parts as MessagePart[],
          model: CHAT_MODEL_ID,
        });
      } catch {
        // Si falla el guardado, la persona ya vio la respuesta; se pierde del
        // historial pero no se le interrumpe la conversación.
      }
    },
  });
}
