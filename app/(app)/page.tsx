import { requireTenantContext } from '@/lib/tenant/context';
import { getEffectivePreferences } from '@/lib/db/repositories/preferences';
import { Chat } from '@/components/chat/chat';

export const dynamic = 'force-dynamic';

/** Lo que se envía al pulsar «necesito ayuda ahora». */
const CRISIS_OPENER =
  'Estoy en una crisis ahora mismo y necesito ayuda para acompañarla. ' +
  'Dime qué hacer en pasos cortos.';

/**
 * Conversación nueva.
 *
 * El identificador se genera aquí y viaja con el primer mensaje: así el
 * streaming empieza sin un viaje extra al servidor para crear la fila. La
 * conversación se materializa en la base cuando llega ese primer mensaje, de
 * modo que abrir la aplicación y no escribir nada no deja basura.
 */
export default async function NuevaConversacionPage({
  searchParams,
}: {
  searchParams: Promise<{ crisis?: string }>;
}) {
  const [ctx, params] = await Promise.all([
    requireTenantContext(),
    searchParams,
  ]);
  const preferences = await getEffectivePreferences(ctx);

  return (
    <Chat
      conversationId={crypto.randomUUID()}
      initialMessages={[]}
      isNew
      speechRate={preferences.speechRate}
      /*
       * El botón de ayuda inmediata de `/crisis` llega aquí con `?crisis=1` y
       * el primer mensaje sale solo. Quien lo pulsó está conteniendo una crisis
       * y no puede redactar; pedirle que escriba «estoy en crisis» para que el
       * orquestador lo entienda sería poner un examen en el peor momento.
       *
       * El texto es fijo y describe la situación en las palabras que el prompt
       * del orquestador reconoce, para que active el módulo en el primer turno.
       */
      autoSend={params.crisis ? CRISIS_OPENER : null}
    />
  );
}
