import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { requireTenantContext } from '@/lib/tenant/context';
import {
  getCurrentTenant,
  listMembershipsForUser,
} from '@/lib/db/repositories/tenants';
import { listConversations } from '@/lib/db/repositories/conversations';
import { AppShell, type NavGroup } from '@/components/shell/app-shell';
import { hasRoleAtLeast } from '@/lib/tenant/guard';
import { isSuperadminEmail } from '@/lib/admin/access';

// Toda ruta autenticada es dinámica: depende de sesión y de tenant.
export const dynamic = 'force-dynamic';

/**
 * El menú, por bloques.
 *
 * ## Por qué agrupado
 *
 * Era una lista plana de diecisiete enlaces, sin separación y en un orden que
 * no respondía a nada. Encontrar algo obligaba a leerlos todos. En una
 * plataforma para personas neurodivergentes eso no es un detalle de estilo:
 * una lista larga sin estructura es exactamente lo que cuesta procesar.
 *
 * El orden de los bloques es por frecuencia de uso. Lo que se abre a diario
 * arriba; los ajustes, abajo. Dentro de cada bloque el orden tampoco es
 * alfabético: es el que tiene sentido para quien lo usa.
 *
 * ## Por qué no todo el mundo ve lo mismo
 *
 * «Mi perfil profesional» aparecía en todas las cuentas, incluidas las de
 * familias que nunca van a atender a nadie. Un menú con opciones que no van
 * contigo no es solo ruido: hace dudar de si te falta hacer algo.
 *
 * Lo que se esconde aquí es **cortesía, no seguridad**. Cada pantalla y cada
 * acción comprueban el rol por su cuenta; ocultar un enlace no protege nada.
 */
function navGroupsFor(options: {
  canPractice: boolean;
  isSpaceAdmin: boolean;
}): NavGroup[] {
  return [
    {
      label: 'Tu día',
      items: [
        { href: '/planes', label: 'Planes', icon: 'planes' },
        { href: '/rutinas', label: 'Rutinas', icon: 'rutinas' },
        { href: '/tareas', label: 'Tareas', icon: 'tareas' },
      ],
    },
    {
      label: 'Cómo estás',
      items: [
        { href: '/sensorialidad', label: 'Sensorialidad', icon: 'sensorialidad' },
        { href: '/crisis', label: 'Crisis', icon: 'crisis' },
        { href: '/alimentacion', label: 'Alimentación', icon: 'alimentacion' },
      ],
    },
    {
      label: 'Material',
      items: [
        { href: '/educacion', label: 'Educación', icon: 'educacion' },
        { href: '/biblioteca', label: 'Biblioteca', icon: 'biblioteca' },
        { href: '/documentos', label: 'Documentos', icon: 'documentos' },
      ],
    },
    {
      label: 'Con otras personas',
      items: [
        { href: '/consultorio', label: 'Consultorio', icon: 'consultorio' },
        { href: '/equipo', label: 'Equipo de apoyo', icon: 'equipo' },
        { href: '/compartido', label: 'Compartido conmigo', icon: 'compartido' },
        /*
         * Solo para quien puede atender. Un admin lo ve porque también puede
         * ejercer: el rol es uno solo, así que quien lleva un espacio y además
         * es profesional no puede tener los dos a la vez.
         */
        ...(options.canPractice
          ? [
              {
                href: '/profesional',
                label: 'Mi perfil profesional',
                icon: 'profesional' as const,
              },
            ]
          : []),
      ],
    },
    {
      label: 'Tu cuenta',
      items: [
        { href: '/memorias', label: 'Lo que recuerdo', icon: 'memorias' },
        { href: '/configuracion/avisos', label: 'Avisos', icon: 'avisos' },
        {
          href: '/configuracion/accesibilidad',
          label: 'Accesibilidad',
          icon: 'configuracion',
        },
        // La suscripción es del espacio: la administra quien lo lleva. Las
        // acciones de cobro también lo comprueban.
        ...(options.isSpaceAdmin
          ? [
              {
                href: '/membresia',
                label: 'Membresía',
                icon: 'membresia' as const,
              },
            ]
          : []),
      ],
    },
  ];
}

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [session, ctx] = await Promise.all([auth(), requireTenantContext()]);
  const [tenant, conversations, memberships] = await Promise.all([
    getCurrentTenant(ctx),
    listConversations(ctx, { limit: 100 }),
    listMembershipsForUser(ctx.userId),
  ]);

  if (!tenant) {
    redirect('/login');
  }

  return (
    <AppShell
      tenantName={tenant.name}
      userName={session?.user?.name ?? 'Tu cuenta'}
      userEmail={session?.user?.email ?? ''}
      navGroups={navGroupsFor({
        // El rol es uno solo, así que quien administra el espacio y además
        // ejerce no puede llevar `professional`. Se le enseña igual.
        canPractice:
          ctx.role === 'professional' || hasRoleAtLeast(ctx, 'admin'),
        isSpaceAdmin: hasRoleAtLeast(ctx, 'admin'),
      })}
      spaces={memberships.map((membership) => ({
        id: membership.tenant.id,
        name: membership.tenant.name,
      }))}
      currentTenantId={ctx.tenantId}
      /*
       * El panel solo se enseña a quien puede entrar. No es la protección —esa
       * está en el layout de `/admin` y en cada acción del repositorio— sino
       * cortesía: un enlace que lleva a un 404 no le sirve a nadie.
       */
      adminHref={
        hasRoleAtLeast(ctx, 'admin') || isSuperadminEmail(session?.user?.email)
          ? '/admin'
          : null
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
