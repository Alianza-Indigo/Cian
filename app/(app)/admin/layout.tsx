import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getAdminContext } from '@/lib/admin/access';

export const dynamic = 'force-dynamic';

/**
 * Puerta del panel.
 *
 * `notFound()` y no un mensaje de «no tienes permiso»: quien no debe estar
 * aquí tampoco tiene por qué enterarse de que el panel existe.
 *
 * Esto es una comodidad de navegación, no la garantía. La garantía está en
 * cada acción y en cada repositorio, que comprueban el rol por su cuenta: un
 * layout no protege una server action que se invoque directamente.
 */
export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const admin = await getAdminContext();
  if (!admin) notFound();

  const tabs = [
    { href: '/admin', label: 'Métricas' },
    { href: '/admin/miembros', label: 'Miembros' },
    // Dar de alta profesionales es tarea de quien administra, no del propio
    // profesional: por eso está aquí y no dentro de «Mi perfil profesional».
    { href: '/admin/profesionales', label: 'Profesionales' },
    { href: '/admin/modelos', label: 'Modelos' },
    { href: '/admin/auditoria', label: 'Auditoría' },
    // La biblioteca la ve cualquier admin: publica para su espacio. Solo el
    // superadmin ve además la lista global y puede publicar en ella.
    { href: '/admin/biblioteca', label: 'Biblioteca' },
    ...(admin.isSuperadmin
      ? [
          // Lo de plataforma primero: es lo que solo el superadmin puede hacer.
          { href: '/admin/espacios', label: 'Espacios' },
          { href: '/admin/prompts', label: 'Prompts' },
          { href: '/admin/planes', label: 'Planes' },
        ]
      : []),
  ];

  return (
    <div style={{ display: 'grid', gap: 'var(--cian-section-gap)' }}>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Administración</h1>
        <p className="mt-2 text-muted-foreground">
          {admin.isSuperadmin
            ? 'Tienes acceso de plataforma: puedes entrar a cualquier espacio y administrarlo, y lo que cambies en prompts, biblioteca y modelo por omisión afecta a todo CIAN. Lo que se habla en una consulta o con CIAN no se ve desde ninguna pantalla de administración.'
            : 'Todo lo que ves aquí es de tu espacio. Los datos de otros espacios no son accesibles desde ninguna ruta.'}
        </p>
      </div>

      <nav aria-label="Secciones de administración">
        <ul className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <li key={tab.href}>
              <Link
                href={tab.href}
                className="inline-flex items-center rounded-lg border border-border bg-card px-3 text-sm hover:bg-muted focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
                style={{ minHeight: 'var(--cian-control-height)' }}
              >
                {tab.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {children}
    </div>
  );
}
