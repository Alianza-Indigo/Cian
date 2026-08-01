'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { MessageList } from './message-list';
import { Composer } from './composer';

type ChatProps = {
  conversationId: string;
  initialMessages: UIMessage[];
  /** Verdadero cuando la conversación aún no existe en la base. */
  isNew: boolean;
};

/** Texto plano de un mensaje, para reeditarlo o reintentarlo. */
function textOf(message: UIMessage): string {
  return message.parts
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join('\n')
    .trim();
}

export function Chat({ conversationId, initialMessages, isNew }: ChatProps) {
  const router = useRouter();
  const [editingText, setEditingText] = useState<string | null>(null);
  const urlSynced = useRef(!isNew);
  const historyRefreshed = useRef(!isNew);

  // El identificador se manda en el cuerpo y el `regenerateFromMessageId` se
  // decide por envío, no por configuración del transporte.
  const regenerateFrom = useRef<string | null>(null);

  const { messages, sendMessage, status, error, setMessages, stop, clearError } =
    useChat({
      id: conversationId,
      messages: initialMessages,
      transport: new DefaultChatTransport({
        api: '/api/chat',
        prepareSendMessagesRequest({ id, messages: outgoing }) {
          const body: Record<string, unknown> = { id, messages: outgoing };
          if (regenerateFrom.current) {
            body.regenerateFromMessageId = regenerateFrom.current;
          }
          return { body };
        },
      }),
    });

  const busy = status === 'submitted' || status === 'streaming';

  // La conversación nueva estrena URL en cuanto tiene contenido, para que
  // recargar o compartir el enlace lleve al lugar correcto.
  useEffect(() => {
    if (urlSynced.current || messages.length === 0) return;
    urlSynced.current = true;
    window.history.replaceState(null, '', `/chat/${conversationId}`);
  }, [messages.length, conversationId]);

  // El historial de la barra lateral se entera cuando termina el primer turno,
  // que es cuando ya existe el título.
  useEffect(() => {
    if (historyRefreshed.current) return;
    if (status !== 'ready' || messages.length < 2) return;
    historyRefreshed.current = true;
    router.refresh();
  }, [status, messages.length, router]);

  const submit = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (trimmed.length === 0 || busy) return;

      clearError();
      regenerateFrom.current = null;
      setEditingText(null);
      void sendMessage({ text: trimmed });
    },
    [busy, clearError, sendMessage],
  );

  /**
   * Reintentar y editar comparten mecánica: la conversación vuelve al punto
   * anterior —en pantalla y en la base— y se envía de nuevo desde ahí.
   */
  const resendFrom = useCallback(
    (userMessageId: string, text: string) => {
      const index = messages.findIndex((message) => message.id === userMessageId);
      if (index === -1 || busy) return;

      clearError();
      regenerateFrom.current = userMessageId;
      setMessages(messages.slice(0, index));
      setEditingText(null);
      void sendMessage({ text });
    },
    [messages, busy, clearError, setMessages, sendMessage],
  );

  const lastUserMessage = [...messages]
    .reverse()
    .find((message) => message.role === 'user');

  const handleRetry = useCallback(() => {
    if (!lastUserMessage) return;
    resendFrom(lastUserMessage.id, textOf(lastUserMessage));
  }, [lastUserMessage, resendFrom]);

  const handleEdit = useCallback(() => {
    if (!lastUserMessage) return;
    setEditingText(textOf(lastUserMessage));
  }, [lastUserMessage]);

  const handleEditSubmit = useCallback(
    (text: string) => {
      if (!lastUserMessage) return;
      resendFrom(lastUserMessage.id, text);
    },
    [lastUserMessage, resendFrom],
  );

  return (
    <div className="flex min-h-[calc(100dvh-12rem)] flex-col">
      <MessageList
        messages={messages}
        status={status}
        error={error}
        canEdit={Boolean(lastUserMessage) && !busy}
        onRetry={handleRetry}
        onEdit={handleEdit}
      />

      <Composer
        onSubmit={editingText === null ? submit : handleEditSubmit}
        onCancelEdit={() => setEditingText(null)}
        onStop={stop}
        busy={busy}
        editingText={editingText}
      />
    </div>
  );
}
