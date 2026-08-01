'use client';

import { useEffect, useRef } from 'react';
import type { ChatStatus, UIMessage } from 'ai';
import { Pencil, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { CianMark } from '@/components/brand/cian-mark';
import { humanizeChatError } from '@/lib/ai/client-errors';
import { DocumentCard } from './document-card';

type MessageListProps = {
  messages: UIMessage[];
  status: ChatStatus;
  error: Error | undefined;
  canEdit: boolean;
  onRetry: () => void;
  onEdit: () => void;
};

function textOf(message: UIMessage): string {
  return message.parts
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join('\n');
}

type CreatedDocument = { documentId: string; titulo: string };

/**
 * Documentos creados por el modelo en este mensaje.
 *
 * El AI SDK expone cada llamada a tool como una parte `tool-<nombre>`. Se leen
 * solo las que ya tienen salida: mientras la tool está en curso no hay
 * identificador que seguir.
 */
function documentsOf(message: UIMessage): CreatedDocument[] {
  const created: CreatedDocument[] = [];

  for (const part of message.parts) {
    if (part.type !== 'tool-createDocument') continue;

    const output = (part as { state?: string; output?: unknown }).output;
    if (!output || typeof output !== 'object') continue;

    const candidate = output as Partial<CreatedDocument>;
    if (typeof candidate.documentId === 'string') {
      created.push({
        documentId: candidate.documentId,
        titulo:
          typeof candidate.titulo === 'string' ? candidate.titulo : 'Documento',
      });
    }
  }

  return created;
}

/**
 * Render de texto plano respetando saltos de línea.
 *
 * En Fase 1 no se interpreta Markdown a propósito: sin un sanitizador
 * revisado, convertir texto del modelo en HTML es una vía de inyección. Queda
 * anotado en NOTES.md para resolverlo con calma.
 */
function MessageText({ text }: { text: string }) {
  return <p className="whitespace-pre-wrap break-words">{text}</p>;
}

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center py-12 text-center">
      <CianMark className="size-14" />
      <h2 className="mt-4 text-xl font-semibold tracking-tight">
        ¿En qué te acompaño?
      </h2>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        Escribe lo que necesites con tus palabras. No tienes que elegir una
        sección ni saber cómo se llama lo que buscas.
      </p>
    </div>
  );
}

export function MessageList({
  messages,
  status,
  error,
  canEdit,
  onRetry,
  onEdit,
}: MessageListProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const lastCount = useRef(messages.length);

  // Se sigue la conversación hacia abajo solo cuando llega un mensaje nuevo,
  // no en cada fragmento del streaming: el salto constante marea.
  useEffect(() => {
    if (messages.length === lastCount.current) return;
    lastCount.current = messages.length;
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  if (messages.length === 0 && !error) {
    return <EmptyState />;
  }

  const lastMessage = messages[messages.length - 1];
  const waiting = status === 'submitted';

  return (
    <div className="flex-1" style={{ display: 'grid', gap: 'var(--cian-gap)' }}>
      {/*
        Región en vivo: los lectores de pantalla anuncian los mensajes nuevos.
        `polite` para no interrumpir lo que la persona esté escuchando.
      */}
      <div role="log" aria-live="polite" aria-label="Conversación con CIAN">
        {messages.map((message) => {
          const isUser = message.role === 'user';
          const text = textOf(message);
          const documents = documentsOf(message);

          // Un mensaje sin texto ni documentos no aporta nada en pantalla.
          if (text.length === 0 && documents.length === 0) return null;

          return (
            <article
              key={message.id}
              aria-label={isUser ? 'Tu mensaje' : 'Respuesta de CIAN'}
              className={cn('flex', isUser ? 'justify-end' : 'justify-start')}
              style={{ marginBlockEnd: 'var(--cian-gap)' }}
            >
              <div
                className={cn(
                  'max-w-[85%] rounded-xl text-sm',
                  isUser
                    ? 'bg-primary px-4 py-3 text-primary-foreground'
                    : 'border border-border bg-card px-4 py-3 text-card-foreground',
                )}
              >
                {text.length > 0 ? <MessageText text={text} /> : null}

                {documents.map((document) => (
                  <DocumentCard
                    key={document.documentId}
                    documentId={document.documentId}
                    fallbackTitle={document.titulo}
                  />
                ))}
              </div>
            </article>
          );
        })}
      </div>

      {waiting ? (
        <p className="text-sm text-muted-foreground" role="status">
          CIAN está pensando…
        </p>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm"
        >
          <p>{humanizeChatError(error)}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={onRetry}
          >
            <RotateCcw aria-hidden="true" />
            Reintentar
          </Button>
        </div>
      ) : null}

      {canEdit && !error ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onEdit}>
            <Pencil aria-hidden="true" />
            Editar mi último mensaje
          </Button>
          {lastMessage?.role === 'assistant' ? (
            <Button type="button" variant="ghost" size="sm" onClick={onRetry}>
              <RotateCcw aria-hidden="true" />
              Pedir otra respuesta
            </Button>
          ) : null}
        </div>
      ) : null}

      <div ref={endRef} />
    </div>
  );
}
