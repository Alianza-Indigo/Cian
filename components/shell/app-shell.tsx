'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Brain,
  BookOpen,
  BriefcaseMedical,
  CreditCard,
  CheckSquare,
  GraduationCap,
  FileText,
  Bell,
  LifeBuoy,
  ListChecks,
  Menu,
  Plus,
  Settings,
  ShieldCheck,
  Share2,
  Sparkles,
  Target,
  Users,
  Video,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { CianMark } from '@/components/brand/cian-mark';
import { signOutAction } from '@/lib/auth/actions';
import { switchTenantAction } from '@/lib/tenant/actions';
import {
  ConversationHistory,
  type ConversationSummary,
} from './conversation-history';

export type NavItem = {
  href: string;
  label: string;
  icon:
    | 'planes'
    | 'rutinas'
    | 'sensorialidad'
    | 'crisis'
    | 'tareas'
    | 'alimentacion'
    | 'educacion'
    | 'biblioteca'
    | 'documentos'
    | 'memorias'
    | 'equipo'
    | 'compartido'
    | 'avisos'
    | 'consultorio'
    | 'profesional'
    | 'membresia'
    | 'admin'
    | 'configuracion';
};

const ICONS = {
  planes: Target,
  rutinas: ListChecks,
  sensorialidad: Sparkles,
  crisis: LifeBuoy,
  tareas: CheckSquare,
  alimentacion: UtensilsCrossed,
  educacion: GraduationCap,
  biblioteca: BookOpen,
  documentos: FileText,
  memorias: Brain,
  equipo: Users,
  compartido: Share2,
  avisos: Bell,
  configuracion: Settings,
  consultorio: Video,
  profesional: BriefcaseMedical,
  membresia: CreditCard,
  admin: ShieldCheck,
} as const;

/**
 * Un bloque del menú.
 *
 * Antes era una lista plana de diecisiete enlaces sin ninguna separación, y
 * encontrar algo exigía leerlos todos. Para quien navega esta plataforma eso no
 * es una molestia estética: una lista larga sin estructura es precisamente lo
 * que cuesta procesar.
 *
 * Los grupos van en orden de frecuencia de uso, no alfabético ni por módulo del
 * PRD. Lo que se abre a diario arriba; lo que se toca una vez, abajo.
 */
export type NavGroup = {
  /** Encabezado del bloque. Uno solo no se enseña: sería ruido. */
  label: string;
  items: readonly NavItem[];
};

export type SpaceOption = { id: string; name: string };

type AppShellProps = {
  tenantName: string;
  userName: string;
  userEmail: string;
  navGroups: readonly NavGroup[];
  /**
   * Espacios a los que pertenece esta persona.
   *
   * Con uno solo no se enseña nada: un selector de una opción es ruido. Deja de
   * estar vacío en cuanto alguien acepta una invitación, que hasta ahora no se
   * podía hacer desde ningún sitio.
   */
  spaces?: readonly SpaceOption[];
  currentTenantId?: string;
  /**
   * El panel de administración, si esta persona puede entrar.
   *
   * Va aparte de `navItems` a propósito: es de otra naturaleza —administrar la
   * plataforma, no acompañar a nadie— y mezclado en la lista de secciones
   * quedaba como decimoséptimo elemento, debajo de Accesibilidad, donde nadie
   * lo encuentra.
   */
  adminHref?: string | null;
  conversations: ConversationSummary[];
  children: React.ReactNode;
};

export function AppShell({
  tenantName,
  userName,
  userEmail,
  navGroups,
  spaces,
  currentTenantId,
  adminHref,
  conversations,
  children,
}: AppShellProps) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  // El cajón se cierra al navegar: en teléfono, quedarse abierto sobre el
  // contenido nuevo desorienta.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!drawerOpen) return;

    closeButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDrawerOpen(false);
        menuButtonRef.current?.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [drawerOpen]);

  /*
   * Tres franjas: cabecera fija, zona con scroll y pie fijo.
   *
   * Antes era una sola columna sin ningún contenedor con scroll. La lista de
   * conversaciones era lo único que podía desplazarse, y el resto —diecisiete
   * secciones más el bloque de cuenta— simplemente medía más que la pantalla de
   * un teléfono. Al no caber, las cajas se encogían por debajo de su contenido y
   * este se salía por abajo, fuera de todo alcance: el pie se pintaba encima de
   * la lista de secciones y las últimas quedaban inaccesibles.
   *
   * El pie se queda fijo a propósito. Cerrar sesión y la cuenta tienen que estar
   * siempre en el mismo sitio: buscarlas desplazándose es justo lo que le cuesta
   * a quien navega esta plataforma.
   */
  /*
   * Tres franjas: cabecera fija, zona con scroll y pie fijo.
   *
   * Antes era una sola columna sin ningún contenedor con scroll. La lista de
   * conversaciones era lo único que podía desplazarse, y el resto —diecisiete
   * secciones más el bloque de cuenta— simplemente medía más que la pantalla de
   * un teléfono. Al no caber, las cajas se encogían por debajo de su contenido
   * y este se salía por abajo, fuera de todo alcance: el pie acababa pintado
   * sobre la lista de secciones y las últimas quedaban inaccesibles.
   *
   * El pie se queda fijo a propósito. La cuenta y cerrar sesión tienen que
   * estar siempre en el mismo sitio: buscarlas desplazándose es justo lo que le
   * cuesta a quien navega esta plataforma.
   */
  const sidebarBody = (
    <div className="flex h-full min-h-0 flex-col">
      {/* --- Cabecera fija ------------------------------------------------ */}
      <div className="flex shrink-0 flex-col gap-3 p-4 pb-3">
        <div className="flex items-center gap-3">
          <CianMark className="h-9" priority />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">CIAN</p>
            <p className="truncate text-xs text-muted-foreground">{tenantName}</p>
          </div>
        </div>

        {spaces && spaces.length > 1 ? (
          <div>
            <label
              htmlFor="selector-espacio"
              className="text-xs font-medium text-muted-foreground"
            >
              Espacio
            </label>
            <select
              id="selector-espacio"
              value={currentTenantId}
              disabled={switching}
              onChange={(event) => {
                const next = event.target.value;
                if (next === currentTenantId) return;
                setSwitching(true);
                // Sin `router.refresh()`: la acción revalida el layout entero,
                // porque al cambiar de espacio cambia absolutamente todo lo que
                // hay en pantalla, no solo la ruta actual.
                void switchTenantAction(next).finally(() => setSwitching(false));
              }}
              className="mt-1 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
              style={{ minHeight: 'var(--cian-control-height)' }}
            >
              {spaces.map((space) => (
                <option key={space.id} value={space.id}>
                  {space.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <Link
          href="/"
          className="flex items-center justify-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          style={{ minHeight: 'var(--cian-control-height)' }}
        >
          <Plus aria-hidden="true" className="size-4" />
          Nueva conversación
        </Link>
      </div>

      {/*
       * --- Zona con scroll ---
       *
       * `min-h-0` no es decorativo: sin él, un hijo de flex nunca baja de su
       * tamaño de contenido y el `overflow` no llega a activarse nunca.
       */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4">
        <ConversationHistory conversations={conversations} />

        {/*
          * Un `<nav>` por bloque, cada uno con su nombre accesible.
          *
          * Con lector de pantalla, un solo `<nav>` de diecisiete enlaces obliga
          * a recorrerlos todos; así se puede saltar de bloque en bloque, que es
          * la misma ventaja que dan los encabezados a quien mira.
          */}
        {navGroups.map((group) => (
          <nav
            key={group.label}
            aria-label={group.label}
            className="mt-2 border-t border-border py-2"
          >
            <h2 className="px-3 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {group.label}
            </h2>

            <ul className="space-y-1">
              {group.items.map((item) => {
                const Icon = ICONS[item.icon];
                const active = pathname.startsWith(item.href);

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors',
                        active
                          ? 'bg-primary-soft text-foreground'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                      )}
                      style={{ minHeight: 'var(--cian-control-height)' }}
                    >
                      <Icon aria-hidden="true" className="size-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        ))}
      </div>

      {/* --- Pie fijo ----------------------------------------------------- */}
      <div className="shrink-0 border-t border-border p-4">
        {adminHref ? (
          <Link
            href={adminHref}
            aria-current={pathname.startsWith(adminHref) ? 'page' : undefined}
            className={cn(
              'mb-3 flex items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors',
              pathname.startsWith(adminHref)
                ? 'bg-primary-soft text-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
            style={{ minHeight: 'var(--cian-control-height)' }}
          >
            <ShieldCheck aria-hidden="true" className="size-4 shrink-0" />
            <span className="truncate">Administración</span>
          </Link>
        ) : null}

        <p className="truncate text-sm font-medium">{userName}</p>
        <p className="truncate text-xs text-muted-foreground">{userEmail}</p>
        <form action={signOutAction} className="mt-3">
          <Button type="submit" variant="outline" size="sm" className="w-full">
            Cerrar sesión
          </Button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[18rem_1fr]">
      <aside className="hidden border-r border-border bg-card lg:block">
        <div className="sticky top-0 h-dvh">{sidebarBody}</div>
      </aside>

      {drawerOpen ? (
        <div className="lg:hidden">
          <button
            type="button"
            aria-label="Cerrar menú"
            tabIndex={-1}
            onClick={() => setDrawerOpen(false)}
            className="fixed inset-0 z-40 bg-foreground/40"
          />
          {/*
            * `h-dvh` y no `inset-y-0`.
            *
            * En un teléfono, un elemento fijo con `inset-y-0` se mide contra el
            * viewport grande, el que existe cuando la barra de direcciones está
            * escondida. Con la barra a la vista, el último tramo del menú cae
            * justo debajo del borde y no hay forma de llegar a él: no es
            * contenido que falte por desplazar, es contenido tapado por el
            * navegador. `h-dvh` sigue al viewport de verdad, el que cambia
            * cuando la barra aparece.
            */}
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Menú de navegación"
            className="fixed left-0 top-0 z-50 flex h-dvh w-80 max-w-[85vw] flex-col border-r border-border bg-card"
          >
            <div className="flex shrink-0 justify-end p-2">
              <Button
                ref={closeButtonRef}
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Cerrar menú"
                onClick={() => {
                  setDrawerOpen(false);
                  menuButtonRef.current?.focus();
                }}
              >
                <X aria-hidden="true" />
              </Button>
            </div>
            {/* Sin `calc(100% - 3.5rem)`: el número mágico dejaba de cuadrar
                en cuanto la altura del botón de cerrar cambiara. */}
            <div className="min-h-0 flex-1">{sidebarBody}</div>
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur lg:hidden">
          <Button
            ref={menuButtonRef}
            type="button"
            variant="outline"
            size="icon"
            aria-label="Abrir menú"
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen(true)}
          >
            <Menu aria-hidden="true" />
          </Button>
          <div className="flex min-w-0 items-center gap-2">
            <CianMark className="h-7" priority />
            <span className="truncate text-sm font-semibold">CIAN</span>
          </div>
          <Link
            href="/"
            aria-label="Nueva conversación"
            className="ml-auto flex items-center justify-center rounded-lg border border-border px-3"
            style={{ minHeight: 'var(--cian-control-height)' }}
          >
            <Plus aria-hidden="true" className="size-4" />
          </Link>
        </header>

        <main
          id="contenido-principal"
          tabIndex={-1}
          className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8"
        >
          <div className="mx-auto w-full max-w-3xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
