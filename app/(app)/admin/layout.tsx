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
    { href: '/admin/modelos', label: 'Modelos' },
    { href: '/admin/auditoria', label: 'Auditoría' },
    ...(admin.isSuperadmin
      ? [
          { href: '/admin/prompts', label: 'Prompts' },
          { href: '/admin/biblioteca', label: 'Biblioteca' },
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
            ? 'Tienes acceso de plataforma: lo que cambies en prompts, biblioteca y modelo por omisión afecta a todo CIAN.'
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
