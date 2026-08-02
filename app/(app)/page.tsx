import { requireTenantContext } from '@/lib/tenant/context';
import { getEffectivePreferences } from '@/lib/db/repositories/preferences';
import { Chat } from '@/components/chat/chat';

export const dynamic = 'force-dynamic';

/**
 * Conversación nueva.
 *
 * El identificador se genera aquí y viaja con el primer mensaje: así el
 * streaming empieza sin un viaje extra al servidor para crear la fila. La
 * conversación se materializa en la base cuando llega ese primer mensaje, de
 * modo que abrir la aplicación y no escribir nada no deja basura.
 */
export default async function NuevaConversacionPage() {
  const ctx = await requireTenantContext();
  const preferences = await getEffectivePreferences(ctx);

  return (
    <Chat
      conversationId={crypto.randomUUID()}
      initialMessages={[]}
      isNew
      speechRate={preferences.speechRate}
    />
  );
}
