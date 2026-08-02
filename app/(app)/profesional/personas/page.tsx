import type { Metadata } from 'next';
import Link from 'next/link';
import { requireTenantContext } from '@/lib/tenant/context';
import { myClients } from '@/lib/db/repositories/practice';
import { Card } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Personas' };
export const dynamic = 'force-dynamic';

const fecha = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'long',
});

/**
 * A quién acompaña esta persona.
 *
 * La lista sale de las citas, no de una tabla de «pacientes»: alguien lo es
 * porque le atendiste, y mantener una lista aparte sería una segunda verdad que
 * puede dejar de coincidir con la primera.
 */
export default async function PersonasPage() {
  const ctx = await requireTenantContext();
  const clients = await myClients(ctx);

  return (
    <div style={{ display: 'grid', gap: 'var(--cian-section-gap)' }}>
      {clients.length === 0 ? (
        <Card>
          <p className="text-sm text-muted-foreground">
            Todavía no has atendido a nadie. Aquí aparecerá quien tenga contigo
            una cita confirmada o ya terminada.
          </p>
        </Card>
      ) : (
        <ul style={{ display: 'grid', gap: 'var(--cian-gap)' }}>
          {clients.map((client) => (
            <li key={client.userId}>
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/profesional/personas/${client.userId}`}
                      className="text-sm font-semibold underline underline-offset-4"
                    >
                      {client.name ?? client.email ?? 'Sin nombre'}
                    </Link>

                    <p className="mt-1 text-xs text-muted-foreground">
                      {client.sessions}{' '}
                      {client.sessions === 1 ? 'sesión' : 'sesiones'}
                      {client.lastAt
                        ? ` · última el ${fecha.format(client.lastAt)}`
                        : ''}
                    </p>

                    {client.nextAt ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Próxima el {fecha.format(client.nextAt)}
                      </p>
                    ) : null}
                  </div>

                  {/*
                    * Los acuerdos pendientes al frente: es lo que hay que mirar
                    * antes de entrar a la siguiente sesión, y lo que se olvida
                    * si hay que buscarlo dentro.
                    */}
                  {client.openTasks > 0 ? (
                    <p className="shrink-0 rounded-lg bg-primary-soft px-3 py-1 text-xs">
                      {client.openTasks}{' '}
                      {client.openTasks === 1
                        ? 'acuerdo pendiente'
                        : 'acuerdos pendientes'}
                    </p>
                  ) : null}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
