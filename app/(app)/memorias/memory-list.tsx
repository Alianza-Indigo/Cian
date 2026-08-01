'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Pencil, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  deleteAllMemoriesAction,
  deleteMemoryAction,
  updateMemoryAction,
} from '@/lib/memories/actions';

export type MemoryItem = {
  id: string;
  key: string;
  value: string;
  confirmedByUser: boolean;
  updatedAt: string;
};

/** `ruidos_fuertes` → `Ruidos fuertes`. La clave interna no se le enseña a nadie. */
function humanizeKey(key: string): string {
  const words = key.replace(/_/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(iso));
}

export function MemoryList({ memories }: { memories: MemoryItem[] }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [confirmingClearAll, setConfirmingClearAll] = useState(false);
  const [status, setStatus] = useState('');
  const [isPending, startTransition] = useTransition();

  function save(id: string) {
    const value = draft.trim();
    if (value.length === 0) return;

    startTransition(async () => {
      const result = await updateMemoryAction(id, value);
      setStatus(result.ok ? 'Memoria actualizada.' : result.error);
      if (result.ok) {
        setEditingId(null);
        router.refresh();
      }
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const result = await deleteMemoryAction(id);
      setStatus(result.ok ? 'Memoria borrada.' : result.error);
      if (result.ok) router.refresh();
    });
  }

  function clearAll() {
    startTransition(async () => {
      const result = await deleteAllMemoriesAction();
      setStatus(result.ok ? 'Se borró todo lo recordado.' : result.error);
      setConfirmingClearAll(false);
      if (result.ok) router.refresh();
    });
  }

  if (memories.length === 0) {
    return (
      <Card>
        <p className="text-sm text-muted-foreground">
          Todavía no hay nada guardado. Si en una conversación le dices a CIAN
          algo como «recuerda que le molestan los ruidos fuertes», aparecerá
          aquí.
        </p>
      </Card>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 'var(--cian-gap)' }}>
      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
        {isPending ? 'Guardando…' : status}
      </p>

      <ul style={{ display: 'grid', gap: 'var(--cian-gap)' }}>
        {memories.map((memory) => (
          <li key={memory.id}>
            <Card>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-semibold">
                    {humanizeKey(memory.key)}
                  </h2>

                  {editingId === memory.id ? (
                    <div className="mt-2">
                      <label htmlFor={`memoria-${memory.id}`} className="sr-only">
                        Contenido de la memoria
                      </label>
                      <textarea
                        id={`memoria-${memory.id}`}
                        autoFocus
                        rows={3}
                        value={draft}
                        onChange={(event) => setDraft(event.currentTarget.value)}
                        className="w-full rounded-lg border border-border bg-background p-2 text-sm outline-none"
                      />
                      <div className="mt-2 flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => save(memory.id)}
                          disabled={isPending}
                        >
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
                      <p className="mt-1 text-sm whitespace-pre-wrap">
                        {memory.value}
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {memory.confirmedByUser
                          ? 'Lo pediste tú'
                          : 'CIAN lo dedujo de la conversación'}
                        {' · '}
                        {formatDate(memory.updatedAt)}
                      </p>
                    </>
                  )}
                </div>

                {editingId === memory.id ? null : (
                  <div className="flex shrink-0 gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Editar "${humanizeKey(memory.key)}"`}
                      onClick={() => {
                        setDraft(memory.value);
                        setEditingId(memory.id);
                      }}
                    >
                      <Pencil aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Borrar "${humanizeKey(memory.key)}"`}
                      disabled={isPending}
                      onClick={() => remove(memory.id)}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          </li>
        ))}
      </ul>

      <Card>
        <h2 className="text-sm font-semibold">Borrar todo</h2>
        {confirmingClearAll ? (
          <>
            <p className="mt-1 text-sm text-muted-foreground">
              Se borrarán las {memories.length} memorias. No se puede deshacer.
            </p>
            <div className="mt-3 flex gap-2">
              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={clearAll}
                disabled={isPending}
              >
                Sí, borrar todo
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setConfirmingClearAll(false)}
              >
                Cancelar
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-1 text-sm text-muted-foreground">
              Elimina de una vez todo lo que CIAN recuerda de ti.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => setConfirmingClearAll(true)}
            >
              Borrar todo lo recordado
            </Button>
          </>
        )}
      </Card>
    </div>
  );
}
