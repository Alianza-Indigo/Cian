import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { assertSuperadmin } from '@/lib/admin/access';
import { listSpaces } from '@/lib/admin/platform';
import { PLAN_LABELS } from '@/lib/billing/types';
import { Card } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Espacios' };
export const dynamic = 'force-dynamic';

const fecha = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/**
 * Todos los espacios de la plataforma.
 *
 * Durante todo el proyecto ninguna consulta cruzaba espacios, y eso dejaba a
 * quien es dueño de CIAN sin poder operarla: no podía ver cuántas
 * organizaciones había ni entender qué pasaba en su propio producto. Aquí sí.
 *
 * Lo que se ve es la operación —quién, cuántos, qué plan, cuánta actividad—.
 * Lo que se dice dentro de una consulta o de una conversación no aparece por
 * ninguna parte, y hay una prueba que falla si alguien lo intenta.
 */
export default async function AdminEspaciosPage() {
  try {
    await assertSuperadmin('adminEspacios');
  } catch {
    notFound();
  }

  const spaces = await listSpaces();

  return (
    <div style={{ display: 'grid', gap: 'var(--cian-section-gap)' }}>
      <div>
        <p className="text-sm text-muted-foreground">
          {spaces.length} {spaces.length === 1 ? 'espacio' : 'espacios'} en la
          plataforma. Desde aquí puedes entrar a cualquiera y administrarlo:
          miembros, roles, profesionales, verificaciones, y concederle plan o
          límites sin pasar por Stripe.
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Lo que se habla en una consulta o con CIAN no se ve desde aquí, ni
          desde ninguna otra pantalla de plataforma.
        </p>
      </div>

      {spaces.length === 0 ? (
        <Card>
          <p className="text-sm text-muted-foreground">
            Todavía no hay ningún espacio.
          </p>
        </Card>
      ) : (
        <ul style={{ display: 'grid', gap: 'var(--cian-gap)' }}>
          {spaces.map((space) => (
            <li key={space.id}>
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/admin/espacios/${space.id}`}
                      className="text-sm font-semibold underline underline-offset-4"
                    >
                      {space.name}
                    </Link>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {space.slug} · desde el {fecha.format(space.createdAt)}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                    <span>
                      {PLAN_LABELS[space.plan]}
                      {/* Que se vea de un vistazo cuáles no pagan. */}
                      {space.granted ? ' · concedido' : ''}
                    </span>
                    <span className="tabular-nums">
                      {space.members}{' '}
                      {space.members === 1 ? 'persona' : 'personas'}
                    </span>
                    <span className="tabular-nums">
                      {space.professionals}{' '}
                      {space.professionals === 1
                        ? 'profesional'
                        : 'profesionales'}
                    </span>
                    <span className="tabular-nums">
                      {space.appointments}{' '}
                      {space.appointments === 1 ? 'cita' : 'citas'}
                    </span>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
