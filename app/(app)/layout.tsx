import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { requireTenantContext } from '@/lib/tenant/context';
import { getCurrentTenant } from '@/lib/db/repositories/tenants';
import { AppShell, type NavItem } from '@/components/shell/app-shell';

// Toda ruta autenticada es dinamica: depende de sesion y de tenant.
export const dynamic = 'force-dynamic';

const NAV_ITEMS: readonly NavItem[] = [
  { href: '/', label: 'Inicio', icon: 'inicio' },
  { href: '/configuracion/accesibilidad', label: 'Accesibilidad', icon: 'configuracion' },
];

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [session, ctx] = await Promise.all([auth(), requireTenantContext()]);
  const tenant = await getCurrentTenant(ctx);

  if (!tenant) {
    redirect('/login');
  }

  return (
    <AppShell
      tenantName={tenant.name}
      userName={session?.user?.name ?? 'Tu cuenta'}
      userEmail={session?.user?.email ?? ''}
      navItems={NAV_ITEMS}
    >
      {children}
    </AppShell>
  );
}
