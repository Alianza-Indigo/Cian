'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Check,
  Download,
  Loader2,
  Pencil,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  deleteDocumentAction,
  regenerateDocumentAction,
  renameDocumentAction,
} from '@/lib/documents/actions';

export type DocumentItem = {
  id: string;
  title: string;
  typeLabel: string;
  format: string;
  status: 'pending' | 'ready' | 'failed';
  folio: string;
  sizeBytes: number | null;
  createdAt: string;
};

function formatSize(bytes: number | null): string | null {
  if (!bytes) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(iso));
}

export function DocumentLibrary({ documents }: { documents: DocumentItem[] }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [revisingId, setRevisingId] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState('');
  const [isPending, startTransition] = useTransition();

  function rename(id: string) {
    const title = draft.trim();
    if (title.length === 0) return;

    startTransition(async () => {
      const result = await renameDocumentAction(id, title);
      setStatus(result.ok ? 'Nombre actualizado.' : result.error);
      if (result.ok) {
        setEditingId(null);
        router.refresh();
      }
    });
  }

  function regenerate(id: string) {
    const note = draft.trim();
    if (note.length === 0) return;

    startTransition(async () => {
      const result = await regenerateDocumentAction(id, note);
      setStatus(
        result.ok ? 'Se preparó una versión nueva.' : result.error,
      );
      if (result.ok) {
        setRevisingId(null);
        setDraft('');
        router.refresh();
      }
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const result = await deleteDocumentAction(id);
      setStatus(result.ok ? 'Documento eliminado.' : result.error);
      setConfirmingDeleteId(null);
      if (result.ok) router.refresh();
    });
  }

  if (documents.length === 0) {
    return (
      <Card>
        <p className="text-sm text-muted-foreground">
          Todavía no hay documentos. En una conversación puedes pedir algo como
          «conviértelo en una carta para la directora» y aparecerá aquí.
        </p>
      </Card>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 'var(--cian-gap)' }}>
      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
        {isPending ? 'Trabajando…' : status}
      </p>

      <ul style={{ display: 'grid', gap: 'var(--cian-gap)' }}>
        {documents.map((document) => (
          <li key={document.id}>
            <Card>
              {editingId === document.id ? (
                <div>
                  <label htmlFor={`titulo-${document.id}`} className="sr-only">
                    Nuevo nombre del documento
                  </label>
                  <input
                    id={`titulo-${document.id}`}
                    autoFocus
                    value={draft}
                    onChange={(event) => setDraft(event.currentTarget.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') rename(document.id);
                      if (event.key === 'Escape') setEditingId(null);
                    }}
                    className="w-full rounded-lg border border-border bg-background p-2 text-sm outline-none"
                  />
                  <div className="mt-2 flex gap-2">
                    <Button type="button" size="sm" onClick={() => rename(document.id)}>
                      <Check aria-hidden="true" />
                      Guardar
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditingId(null)}
                    >
                      <X aria-hidden="true" />
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h2 className="text-sm font-semibold">{document.title}</h2>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {document.typeLabel} · {document.format.toUpperCase()} ·
                        Folio {document.folio} · {formatDate(document.createdAt)}
                        {formatSize(document.sizeBytes)
                          ? ` · ${formatSize(document.sizeBytes)}`
                          : ''}
                      </p>

                      {document.status === 'pending' ? (
                        <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                          <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
                          Preparándose…
                        </p>
                      ) : null}

                      {document.status === 'failed' ? (
                        <p className="mt-2 flex items-center gap-2 text-xs">
                          <AlertTriangle aria-hidden="true" className="size-3.5 shrink-0" />
                          No se pudo preparar. Prueba a pedir una versión nueva.
                        </p>
                      ) : null}
                    </div>

                    <div className="flex shrink-0 gap-1">
                      {document.status === 'ready' ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Descargar "${document.title}"`}
                          onClick={() => {
                            window.location.href = `/api/documentos/${document.id}`;
                          }}
                        >
                          <Download aria-hidden="true" />
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Cambiar nombre de "${document.title}"`}
                        onClick={() => {
                          setDraft(document.title);
                          setEditingId(document.id);
                        }}
                      >
                        <Pencil aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Pedir versión corregida de "${document.title}"`}
                        onClick={() => {
                          setDraft('');
                          setRevisingId(
                            revisingId === document.id ? null : document.id,
                          );
                        }}
                      >
                        <RefreshCw aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Eliminar "${document.title}"`}
                        onClick={() => setConfirmingDeleteId(document.id)}
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </div>
                  </div>

                  {revisingId === document.id ? (
                    <div className="mt-3 border-t border-border pt-3">
                      <label
                        htmlFor={`revision-${document.id}`}
                        className="text-sm font-medium"
                      >
                        ¿Qué quieres cambiar?
                      </label>
                      <textarea
                        id={`revision-${document.id}`}
                        rows={3}
                        value={draft}
                        onChange={(event) => setDraft(event.currentTarget.value)}
                        placeholder="Por ejemplo: hazlo más breve y quita la parte de los horarios."
                        className="mt-2 w-full rounded-lg border border-border bg-background p-2 text-sm outline-none"
                      />
                      <div className="mt-2 flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          disabled={isPending || draft.trim().length === 0}
                          onClick={() => regenerate(document.id)}
                        >
                          <RefreshCw aria-hidden="true" />
                          Preparar versión nueva
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setRevisingId(null)}
                        >
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  {confirmingDeleteId === document.id ? (
                    <div className="mt-3 border-t border-border pt-3">
                      <p className="text-sm">
                        ¿Eliminar «{document.title}»? No se puede deshacer.
                      </p>
                      <div className="mt-2 flex gap-2">
                        <Button
                          type="button"
                          variant="danger"
                          size="sm"
                          disabled={isPending}
                          onClick={() => remove(document.id)}
                        >
                          Sí, eliminar
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmingDeleteId(null)}
                        >
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </>
              )}
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
