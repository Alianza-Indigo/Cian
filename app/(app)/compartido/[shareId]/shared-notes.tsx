'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { addSharedNoteAction } from '@/lib/team/actions';

type Note = {
  id: string;
  authorName: string | null;
  isMine: boolean;
  content: string;
  createdAt: string;
};

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

/**
 * Notas sobre un recurso compartido.
 *
 * Van firmadas y con fecha, y nunca modifican el recurso. Un docente puede
 * opinar sobre un plan de apoyo; lo que no puede es cambiarlo sin que se note.
 */
export function SharedNotes({
  shareId,
  canWrite,
  notes,
}: {
  shareId: string;
  canWrite: boolean;
  notes: Note[];
}) {
  const router = useRouter();
  const [content, setContent] = useState('');
  const [status, setStatus] = useState('');
  const [isPending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = content.trim();
    if (trimmed.length === 0) return;

    startTransition(async () => {
      const result = await addSharedNoteAction(shareId, trimmed);
      setStatus(result.ok ? '' : result.error);
      if (result.ok) {
        setContent('');
        router.refresh();
      }
    });
  }

  return (
    <section aria-labelledby="notas">
      <h2 id="notas" className="text-lg font-semibold tracking-tight">
        Notas
      </h2>

      {notes.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Todavía no hay notas sobre este recurso.
        </p>
      ) : (
        <ul className="mt-3" style={{ display: 'grid', gap: 'var(--cian-gap)' }}>
          {notes.map((note) => (
            <li key={note.id}>
              <Card>
                <p className="text-xs text-muted-foreground">
                  {note.isMine ? 'Tú' : note.authorName ?? 'Alguien'} ·{' '}
                  {formatDate(note.createdAt)}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{note.content}</p>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {canWrite ? (
        <form onSubmit={submit} className="mt-3">
          <label htmlFor="nota-nueva" className="text-sm font-medium">
            Escribir una nota
          </label>
          <textarea
            id="nota-nueva"
            rows={3}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
            placeholder="Lo que observas, lo que funcionó, lo que quieres preguntar."
          />
          <div className="mt-2 flex items-center gap-3">
            <Button type="submit" disabled={isPending || content.trim().length === 0}>
              <Send aria-hidden="true" />
              Guardar nota
            </Button>
            <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
              {isPending ? 'Guardando…' : status}
            </p>
          </div>
        </form>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          Tienes permiso de solo lectura sobre este recurso.
        </p>
      )}
    </section>
  );
}
