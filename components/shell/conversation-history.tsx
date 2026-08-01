'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Archive, Check, MoreHorizontal, Pencil, Search, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  archiveConversationAction,
  deleteConversationAction,
  renameConversationAction,
} from '@/lib/chat/actions';

export type ConversationSummary = {
  id: string;
  title: string | null;
  status: 'active' | 'archived';
};

/** Sin título todavía: la conversación existe pero el modelo aún no la nombró. */
const UNTITLED = 'Conversación nueva';

export function ConversationHistory({
  conversations,
}: {
  conversations: ConversationSummary[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle.length === 0) return conversations;
    return conversations.filter((conversation) =>
      (conversation.title ?? UNTITLED).toLowerCase().includes(needle),
    );
  }, [conversations, query]);

  function commitRename(id: string) {
    const title = draftTitle.trim();
    setEditingId(null);
    if (title.length === 0) return;

    startTransition(async () => {
      await renameConversationAction(id, title);
      router.refresh();
    });
  }

  function archive(id: string) {
    setOpenMenuId(null);
    startTransition(async () => {
      await archiveConversationAction(id, true);
      router.refresh();
    });
  }

  function remove(id: string) {
    setOpenMenuId(null);
    startTransition(async () => {
      await deleteConversationAction(id);
      if (pathname === `/chat/${id}`) {
        router.push('/');
      }
      router.refresh();
    });
  }

  return (
    <div className="min-w-0 flex-1 overflow-y-auto">
      <div className="relative mb-2">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <label htmlFor="buscar-conversaciones" className="sr-only">
          Buscar en tus conversaciones
        </label>
        <input
          id="buscar-conversaciones"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder="Buscar…"
          className="w-full rounded-lg border border-border bg-card py-2 pl-8 pr-2 text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="px-1 py-2 text-xs text-muted-foreground">
          {conversations.length === 0
            ? 'Todavía no tienes conversaciones.'
            : 'Ninguna conversación coincide.'}
        </p>
      ) : (
        <ul className="space-y-0.5" aria-label="Tus conversaciones">
          {filtered.map((conversation) => {
            const href = `/chat/${conversation.id}`;
            const active = pathname === href;
            const title = conversation.title ?? UNTITLED;

            if (editingId === conversation.id) {
              return (
                <li key={conversation.id} className="flex items-center gap-1">
                  <label htmlFor={`titulo-${conversation.id}`} className="sr-only">
                    Nuevo nombre de la conversación
                  </label>
                  <input
                    id={`titulo-${conversation.id}`}
                    autoFocus
                    value={draftTitle}
                    onChange={(event) => setDraftTitle(event.currentTarget.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') commitRename(conversation.id);
                      if (event.key === 'Escape') setEditingId(null);
                    }}
                    className="min-w-0 flex-1 rounded-lg border border-border bg-card px-2 py-1.5 text-sm outline-none"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Guardar nombre"
                    onClick={() => commitRename(conversation.id)}
                  >
                    <Check aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Cancelar"
                    onClick={() => setEditingId(null)}
                  >
                    <X aria-hidden="true" />
                  </Button>
                </li>
              );
            }

            return (
              <li key={conversation.id} className="group relative flex items-center">
                <Link
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'min-w-0 flex-1 truncate rounded-lg px-2 py-2 text-sm transition-colors',
                    active
                      ? 'bg-primary-soft text-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  {title}
                </Link>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Acciones de "${title}"`}
                  aria-expanded={openMenuId === conversation.id}
                  disabled={isPending}
                  onClick={() =>
                    setOpenMenuId(
                      openMenuId === conversation.id ? null : conversation.id,
                    )
                  }
                >
                  <MoreHorizontal aria-hidden="true" />
                </Button>

                {openMenuId === conversation.id ? (
                  <div
                    role="menu"
                    aria-label={`Acciones de "${title}"`}
                    className="absolute right-0 top-full z-20 mt-1 w-48 rounded-lg border border-border bg-card p-1 shadow-sm"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted"
                      onClick={() => {
                        setDraftTitle(title);
                        setEditingId(conversation.id);
                        setOpenMenuId(null);
                      }}
                    >
                      <Pencil aria-hidden="true" className="size-4" />
                      Cambiar nombre
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted"
                      onClick={() => archive(conversation.id)}
                    >
                      <Archive aria-hidden="true" className="size-4" />
                      Archivar
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-danger hover:bg-muted"
                      onClick={() => remove(conversation.id)}
                    >
                      <Trash2 aria-hidden="true" className="size-4" />
                      Eliminar
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
