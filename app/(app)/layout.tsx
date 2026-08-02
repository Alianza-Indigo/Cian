import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { requireTenantContext } from '@/lib/tenant/context';
import { getCurrentTenant } from '@/lib/db/repositories/tenants';
import { listConversations } from '@/lib/db/repositories/conversations';
import { AppShell, type NavItem } from '@/components/shell/app-shell';
import { hasRoleAtLeast } from '@/lib/tenant/guard';
import { isSuperadminEmail } from '@/lib/admin/access';

// Toda ruta autenticada es dinámica: depende de sesión y de tenant.
export const dynamic = 'force-dynamic';

const NAV_ITEMS: readonly NavItem[] = [
  { href: '/planes', label: 'Planes', icon: 'planes' },
  { href: '/rutinas', label: 'Rutinas', icon: 'rutinas' },
  { href: '/tareas', label: 'Tareas', icon: 'tareas' },
  { href: '/sensorialidad', label: 'Sensorialidad', icon: 'sensorialidad' },
  { href: '/crisis', label: 'Crisis', icon: 'crisis' },
  { href: '/alimentacion', label: 'Alimentación', icon: 'alimentacion' },
  { href: '/educacion', label: 'Educación', icon: 'educacion' },
  { href: '/biblioteca', label: 'Biblioteca', icon: 'biblioteca' },
  { href: '/documentos', label: 'Documentos', icon: 'documentos' },
  { href: '/equipo', label: 'Equipo de apoyo', icon: 'equipo' },
  { href: '/compartido', label: 'Compartido conmigo', icon: 'compartido' },
  { href: '/memorias', label: 'Lo que recuerdo', icon: 'memorias' },
  { href: '/configuracion/avisos', label: 'Avisos', icon: 'avisos' },
  { href: '/membresia', label: 'Membresía', icon: 'membresia' },
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
      navItems={
        // El panel solo aparece para quien puede entrar. No es la protección
        // —esa está en el layout de /admin y en cada acción— sino cortesía:
        // un enlace que lleva a un 404 no le sirve a nadie.
        hasRoleAtLeast(ctx, 'admin') || isSuperadminEmail(session?.user?.email)
          ? [
              ...NAV_ITEMS,
              { href: '/admin', label: 'Administración', icon: 'admin' as const },
            ]
          : NAV_ITEMS
      }
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
