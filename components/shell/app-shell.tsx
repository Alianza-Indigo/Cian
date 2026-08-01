'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Menu, Settings, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { CianMark } from '@/components/brand/cian-mark';
import { signOutAction } from '@/lib/auth/actions';

export type NavItem = {
  href: string;
  label: string;
  icon: 'inicio' | 'configuracion';
};

const ICONS = {
  inicio: Home,
  configuracion: Settings,
} as const;

type AppShellProps = {
  tenantName: string;
  userName: string;
  userEmail: string;
  navItems: readonly NavItem[];
  children: React.ReactNode;
};

export function AppShell({
  tenantName,
  userName,
  userEmail,
  navItems,
  children,
}: AppShellProps) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  // El cajon se cierra al navegar: en telefono, quedarse abierto sobre el
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

  const navigation = (
    <nav aria-label="Secciones de CIAN" className="min-w-0 flex-1">
      <ul className="space-y-1">
        {navItems.map((item) => {
          const Icon = ICONS[item.icon];
          const active =
            pathname === item.href ||
            (item.href !== '/' && pathname.startsWith(`${item.href}/`));

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
  );

  const sidebarBody = (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="flex items-center gap-3">
        <CianMark className="size-9" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">CIAN</p>
          <p className="truncate text-xs text-muted-foreground">{tenantName}</p>
        </div>
      </div>

      {navigation}

      <div className="border-t border-border pt-4">
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
    <div className="min-h-dvh lg:grid lg:grid-cols-[17rem_1fr]">
      {/* Barra lateral fija en escritorio */}
      <aside className="hidden border-r border-border bg-card lg:block">
        <div className="sticky top-0 h-dvh">{sidebarBody}</div>
      </aside>

      {/* Cajon en telefono */}
      {drawerOpen ? (
        <div className="lg:hidden">
          <button
            type="button"
            aria-label="Cerrar menú"
            tabIndex={-1}
            onClick={() => setDrawerOpen(false)}
            className="fixed inset-0 z-40 bg-foreground/40"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Menú de navegación"
            className="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] border-r border-border bg-card"
          >
            <div className="flex justify-end p-2">
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
            {sidebarBody}
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
            <CianMark className="size-7" />
            <span className="truncate text-sm font-semibold">CIAN</span>
          </div>
        </header>

        <main
          id="contenido-principal"
          tabIndex={-1}
          className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8"
        >
          <div className="mx-auto w-full max-w-3xl">{children}</div>
        </main>

        <footer className="border-t border-border px-4 py-4 text-center text-xs text-muted-foreground sm:px-6 lg:px-8">
          CIAN no sustituye atención médica, psicológica, terapéutica ni legal.
          No diagnostica ni prescribe, y no es un servicio de emergencia.
        </footer>
      </div>
    </div>
  );
}
