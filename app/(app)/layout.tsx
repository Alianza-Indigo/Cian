import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { requireTenantContext } from '@/lib/tenant/context';
import { getCurrentTenant } from '@/lib/db/repositories/tenants';
import { listConversations } from '@/lib/db/repositories/conversations';
import { AppShell, type NavItem } from '@/components/shell/app-shell';

// Toda ruta autenticada es dinámica: depende de sesión y de tenant.
export const dynamic = 'force-dynamic';

const NAV_ITEMS: readonly NavItem[] = [
  { href: '/planes', label: 'Planes', icon: 'planes' },
  { href: '/rutinas', label: 'Rutinas', icon: 'rutinas' },
  { href: '/tareas', label: 'Tareas', icon: 'tareas' },
  { href: '/sensorialidad', label: 'Sensorialidad', icon: 'sensorialidad' },
  { href: '/alimentacion', label: 'Alimentación', icon: 'alimentacion' },
  { href: '/educacion', label: 'Educación', icon: 'educacion' },
  { href: '/biblioteca', label: 'Biblioteca', icon: 'biblioteca' },
  { href: '/documentos', label: 'Documentos', icon: 'documentos' },
  { href: '/memorias', label: 'Lo que recuerdo', icon: 'memorias' },
  {
    href: '/configuracion/accesibilidad',
    label: 'Accesibilidad',
    icon: 'configuracion',
  },
];

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [session, ctx] = await Promise.all([auth(), requireTenantContext()]);
  const [tenant, conversations] = await Promise.all([
    getCurrentTenant(ctx),
    listConversations(ctx, { limit: 100 }),
  ]);

  if (!tenant) {
    redirect('/login');
  }

  return (
    <AppShell
      tenantName={tenant.name}
      userName={session?.user?.name ?? 'Tu cuenta'}
      userEmail={session?.user?.email ?? ''}
      navItems={NAV_ITEMS}
      conversations={conversations.map((conversation) => ({
        id: conversation.id,
        title: conversation.title,
        status: conversation.status,
      }))}
    >
      {children}
    </AppShell>
  );
}
