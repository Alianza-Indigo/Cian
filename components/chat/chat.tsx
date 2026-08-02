'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { MessageList } from './message-list';
import { Composer } from './composer';
import { CrisisMode, crisisStateOf } from './crisis-mode';
import type { UploadedAttachment } from '@/lib/attachments/client';

type ChatProps = {
  conversationId: string;
  initialMessages: UIMessage[];
  /** Verdadero cuando la conversación aún no existe en la base. */
  isNew: boolean;
  /** Velocidad de lectura por voz configurada por la persona. */
  speechRate: number;
};

/** Texto plano de un mensaje, para reeditarlo o reintentarlo. */
function textOf(message: UIMessage): string {
  return message.parts
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join('\n')
    .trim();
}

export function Chat({
  conversationId,
  initialMessages,
  isNew,
  speechRate,
}: ChatProps) {
  const router = useRouter();
  const [editingText, setEditingText] = useState<string | null>(null);
  const [dismissedCrisisKey, setDismissedCrisisKey] = useState<string | null>(null);
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
    (text: string, attachments: UploadedAttachment[]) => {
      const trimmed = text.trim();
      if ((trimmed.length === 0 && attachments.length === 0) || busy) return;

      clearError();
      regenerateFrom.current = null;
      setEditingText(null);

      // Las partes de archivo apuntan a nuestra ruta privada; el servidor las
      // sustituye por el contenido real antes de llamar al modelo.
      const fileParts = attachments.map((attachment) => ({
        type: 'file' as const,
        mediaType: attachment.mediaType,
        filename: attachment.filename,
        url: attachment.url,
      }));

      if (fileParts.length === 0) {
        void sendMessage({ text: trimmed });
        return;
      }

      void sendMessage({
        role: 'user',
        parts: [
          ...fileParts,
          ...(trimmed.length > 0 ? [{ type: 'text' as const, text: trimmed }] : []),
        ],
      });
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

  /*
   * Modo crisis. Se enciende solo cuando el modelo llamó a
   * `activateCrisisSupport`, nunca por palabras clave del lado del cliente:
   * simplificar la interfaz de golpe porque alguien escribió «crisis» sería
   * quitarle la conversación a quien no la estaba teniendo.
   *
   * Salir es decisión de la persona y se recuerda hasta que haya una
   * activación nueva. Una interfaz que insiste en simplificarse después de que
   * le dijeron que no es una interfaz que no escucha.
   */
  const crisis = crisisStateOf(messages);
  const crisisKey = crisis ? messages[crisis.messageIndex]?.id ?? null : null;
  const showCrisisMode = crisis !== null && dismissedCrisisKey !== crisisKey;

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

  // Al editar no se vuelven a mandar adjuntos: el mensaje original conserva
  // los suyos y reenviarlos duplicaría los archivos.
  const handleEditWithAttachments = useCallback(
    (text: string) => handleEditSubmit(text),
    [handleEditSubmit],
  );

  if (showCrisisMode && crisis) {
    // Solo se muestra texto posterior a la activación: repetir en prosa los
    // pasos que ya están en pantalla es justo el ruido que sobra aquí.
    const later = messages
      .slice(crisis.messageIndex + 1)
      .filter((message) => message.role === 'assistant');
    const latest = later[later.length - 1];

    return (
      <div className="flex min-h-[calc(100dvh-12rem)] flex-col">
        <CrisisMode
          state={crisis}
          latestText={latest ? textOf(latest) || null : null}
          busy={busy}
          onQuickReply={(text) => submit(text, [])}
          onExit={() => setDismissedCrisisKey(crisisKey)}
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100dvh-12rem)] flex-col">
      <MessageList
        messages={messages}
        status={status}
        error={error}
        canEdit={Boolean(lastUserMessage) && !busy}
        speechRate={speechRate}
        onRetry={handleRetry}
        onEdit={handleEdit}
      />

      <Composer
        onSubmit={editingText === null ? submit : handleEditWithAttachments}
        onCancelEdit={() => setEditingText(null)}
        onStop={stop}
        busy={busy}
        editingText={editingText}
      />
    </div>
  );
}
