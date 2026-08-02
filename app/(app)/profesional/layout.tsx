import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireTenantContext } from '@/lib/tenant/context';
import { hasRoleAtLeast } from '@/lib/tenant/guard';
import { getMyProfessionalProfile } from '@/lib/db/repositories/consultorio';

export const dynamic = 'force-dynamic';

/**
 * Puerta del espacio de trabajo profesional.
 *
 * Entra quien tiene el rol de profesional, quien administra el espacio —el rol
 * es uno solo, así que alguien que lleva la organización y además ejerce no
 * puede tener los dos— y quien ya tiene un perfil profesional creado, para que
 * un cambio de rol no le deje sin acceso a su propio expediente de trabajo.
 *
 * Esto es comodidad de navegación, no la garantía. Cada consulta del
 * repositorio resuelve el profesional a partir de `ctx.userId` y no acepta un
 * identificador de fuera: sin perfil, la agenda sale vacía y el expediente de
 * cualquier persona devuelve `null`.
 */
export default async function ProfesionalLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const ctx = await requireTenantContext();

  const profile = await getMyProfessionalProfile(ctx);
  const puedeEntrar =
    ctx.role === 'professional' || hasRoleAtLeast(ctx, 'admin') || profile !== null;

  if (!puedeEntrar) notFound();

  const tabs = [
    { href: '/profesional', label: 'Agenda' },
    { href: '/profesional/personas', label: 'Personas' },
    { href: '/profesional/perfil', label: 'Mi perfil' },
  ];

  return (
    <div style={{ display: 'grid', gap: 'var(--cian-section-gap)' }}>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tu consulta</h1>
        <p className="mt-2 text-muted-foreground">
          {profile === null
            ? 'Antes de poder atender hace falta que rellenes tu perfil y que quien administra el espacio te verifique.'
            : profile.verificationStatus === 'verificado'
              ? 'Tu agenda, las personas a las que acompañas y tu perfil.'
              : 'Tu perfil todavía no está verificado: hasta entonces no apareces en el consultorio ni puedes recibir citas.'}
        </p>
      </div>

      <nav aria-label="Secciones de tu consulta">
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
