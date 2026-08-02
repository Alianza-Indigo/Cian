import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getAdminContext } from '@/lib/admin/access';
import { listAuditLog } from '@/lib/db/repositories/audit';
import { Card } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Auditoría' };
export const dynamic = 'force-dynamic';

/**
 * Bitácora de auditoría del propio espacio.
 *
 * `listAuditLog` exige rol `admin` **y** filtra por `ctx.tenantId`, así que un
 * admin de un espacio no ve el de otro por ninguna ruta. Ese es el criterio de
 * aceptación, y se cumple en el repositorio y no en esta pantalla: una página
 * no protege nada.
 *
 * Aquí solo aparece qué pasó y sobre qué entidad. El registro nunca copia
 * contenido —lo impide `sanitizeMetadata`, de la Fase 0— porque una bitácora
 * que guardara el texto sería otra copia de datos de salud.
 */
export default async function AdminAuditoriaPage() {
  const admin = await getAdminContext();
  if (!admin) notFound();

  const entries = await listAuditLog(admin.ctx, 100);

  return (
    <section aria-labelledby="auditoria">
      <h2 id="auditoria" className="text-lg font-semibold tracking-tight">
        Últimos movimientos
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Qué se hizo y sobre qué. Nunca el contenido.
      </p>

      <Card className="mt-3">
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Todavía no hay nada registrado.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="w-full text-sm">
              <caption className="sr-only">Registro de auditoría</caption>
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th scope="col" className="pb-2 pr-4 font-medium">Cuándo</th>
                  <th scope="col" className="pb-2 pr-4 font-medium">Acción</th>
                  <th scope="col" className="pb-2 pr-4 font-medium">Entidad</th>
                  <th scope="col" className="pb-2 font-medium">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-t border-border align-top">
                    <td className="whitespace-nowrap py-2 pr-4 text-xs text-muted-foreground">
                      {new Intl.DateTimeFormat('es-MX', {
                        day: 'numeric',
                        month: 'short',
                        hour: 'numeric',
                        minute: '2-digit',
                      }).format(entry.createdAt)}
                    </td>
                    <td className="py-2 pr-4">{entry.action}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{entry.entity}</td>
                    <td className="py-2 text-xs text-muted-foreground">
                      {entry.metadata
                        ? Object.entries(entry.metadata)
                            .map(([key, value]) => `${key}: ${String(value)}`)
                            .join(' · ')
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </section>
  );
}
