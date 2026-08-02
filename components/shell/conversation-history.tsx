'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
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
  const [isPending, startTransition] = useTransition();

  /*
   * El menú de acciones se posiciona con `fixed`, no con `absolute`.
   *
   * Estaba dentro de un contenedor con `overflow-y-auto`, y eso lo recortaba:
   * al abrirlo en la última conversación de la lista quedaban 122 píxeles
   * tapados —medido a 390×780— y «Eliminar» no se veía. El menú alargaba el
   * área desplazable, así que técnicamente se podía llegar a él desplazando
   * otros 122 píxeles, pero nadie lo adivina: lo que se ve es un menú cortado.
   *
   * Con `fixed` sale del recorte porque se mide contra el viewport. Se guardan
   * las coordenadas del disparador al abrirlo, y por eso el menú se cierra al
   * desplazar: quedarse pegado al viewport mientras la lista se mueve debajo lo
   * dejaría señalando a otra conversación, que es peor que cerrarse.
   */
  const [menu, setMenu] = useState<{
    id: string;
    top: number;
    right: number;
  } | null>(null);

  const openMenuId = menu?.id ?? null;
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRefs = useRef(new Map<string, HTMLButtonElement>());

  function setOpenMenuId(id: string | null) {
    if (id === null) {
      setMenu(null);
      return;
    }

    const trigger = triggerRefs.current.get(id);
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    setMenu({
      id,
      top: rect.bottom + 4,
      // Alineado por la derecha con el botón, como estaba con `right-0`.
      right: window.innerWidth - rect.right,
    });
  }

  /*
   * Si el menú se sale por abajo, se sube hasta que quepa.
   *
   * Se mide después de pintarlo en vez de calcular su altura de antemano: el
   * alto real depende del tamaño de letra del sistema, y quien usa esta
   * plataforma es bastante probable que lo tenga subido.
   */
  useEffect(() => {
    const el = menuRef.current;
    if (!el || !menu) return;

    const MARGEN = 8;
    const rect = el.getBoundingClientRect();
    if (rect.bottom <= window.innerHeight - MARGEN) return;

    const top = Math.max(MARGEN, window.innerHeight - MARGEN - rect.height);
    if (Math.abs(top - menu.top) > 1) setMenu({ ...menu, top });
  }, [menu]);

  /*
   * Cerrar el menú: con Escape, al tocar fuera, al desplazar y al cambiar el
   * tamaño de la ventana.
   *
   * Lo de tocar fuera y Escape faltaba: el menú se quedaba abierto hasta que se
   * volviera a pulsar el mismo botón, incluso navegando a otra pantalla.
   */
  useEffect(() => {
    if (!menu) return;

    const alDesplazar = () => setMenu(null);

    const alPulsarTecla = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setMenu(null);
      triggerRefs.current.get(menu.id)?.focus();
    };

    const alTocarFuera = (event: PointerEvent) => {
      const objetivo = event.target as Node;
      if (menuRef.current?.contains(objetivo)) return;
      // El propio disparador se ignora: su `onClick` ya alterna el menú, y
      // cerrarlo aquí lo volvería a abrir un instante después.
      if (triggerRefs.current.get(menu.id)?.contains(objetivo)) return;
      setMenu(null);
    };

    // `true` para capturar también el desplazamiento de la lista, que no burbujea.
    window.addEventListener('scroll', alDesplazar, true);
    window.addEventListener('resize', alDesplazar);
    document.addEventListener('keydown', alPulsarTecla);
    document.addEventListener('pointerdown', alTocarFuera);

    return () => {
      window.removeEventListener('scroll', alDesplazar, true);
      window.removeEventListener('resize', alDesplazar);
      document.removeEventListener('keydown', alPulsarTecla);
      document.removeEventListener('pointerdown', alTocarFuera);
    };
  }, [menu]);

  /* Al abrirlo, el foco entra en la primera opción: es un menú, no un aviso. */
  useEffect(() => {
    if (!menu) return;
    menuRef.current?.querySelector('button')?.focus();
    // Solo al cambiar de conversación, no en cada reajuste de posición.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu?.id]);

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

  /*
   * Altura acotada, y no `flex-1`.
   *
   * Antes esta lista se quedaba con todo el espacio sobrante del menú y era la
   * única parte que se desplazaba. Con eso, las secciones —Crisis entre ellas—
   * quedaban empujadas fuera de la pantalla en un teléfono.
   *
   * Ahora el menú entero se desplaza y esta lista tiene tope: por muchas
   * conversaciones que haya, las secciones siguen a un dedo de distancia. Que
   * llegar a Crisis dependa de cuántas conversaciones tengas es exactamente lo
   * que no puede pasar.
   */
  return (
    <div className="min-w-0 max-h-[40vh] overflow-y-auto">
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
                  ref={(node) => {
                    if (node) triggerRefs.current.set(conversation.id, node);
                    else triggerRefs.current.delete(conversation.id);
                  }}
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Acciones de "${title}"`}
                  aria-expanded={openMenuId === conversation.id}
                  aria-haspopup="menu"
                  disabled={isPending}
                  onClick={() =>
                    setOpenMenuId(
                      openMenuId === conversation.id ? null : conversation.id,
                    )
                  }
                >
                  <MoreHorizontal aria-hidden="true" />
                </Button>

                {menu && menu.id === conversation.id ? (
                  <div
                    ref={menuRef}
                    role="menu"
                    aria-label={`Acciones de "${title}"`}
                    /*
                     * `fixed` con coordenadas del disparador: es lo que lo saca
                     * del recorte del contenedor con scroll. Sigue viviendo en
                     * el DOM junto a su botón, así que para un lector de
                     * pantalla el menú y lo que lo abrió no se separan.
                     */
                    style={{
                      position: 'fixed',
                      top: menu.top,
                      right: menu.right,
                    }}
                    className="z-50 w-48 rounded-lg border border-border bg-card p-1 shadow-lg"
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
