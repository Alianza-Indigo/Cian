import type { Metadata } from 'next';
import { getAdminContext } from '@/lib/admin/access';
import { notFound } from 'next/navigation';
import { getUsageMetrics } from '@/lib/db/repositories/billing';
import { listTenantMembersWithUsers } from '@/lib/db/repositories/tenants';
import { Card } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Métricas' };
export const dynamic = 'force-dynamic';

function formatNumber(value: number): string {
  return new Intl.NumberFormat('es-MX').format(value);
}

/**
 * Métricas del espacio.
 *
 * Criterio del PRD: «las métricas de uso cuadran con `usage_events`». Los
 * tokens salen exclusivamente de esa tabla, sin contadores paralelos que
 * puedan desincronizarse, y el desglose por modelo permite comprobarlo a mano.
 *
 * No hay costo estimado en pesos. Poner una cifra de dinero exigiría cablear
 * aquí el precio por millón de tokens de cada modelo, que cambia sin avisar y
 * sin que nada en el código se entere: una cifra desactualizada sobre la que
 * se toman decisiones es peor que ninguna. Los tokens por modelo están, que es
 * el dato que sí es verdad.
 */
export default async function AdminMetricasPage() {
  const admin = await getAdminContext();
  if (!admin) notFound();

  const [metrics, members] = await Promise.all([
    getUsageMetrics(admin.ctx),
    listTenantMembersWithUsers(admin.ctx),
  ]);

  const cards = [
    { label: 'Mensajes este mes', value: formatNumber(metrics.mensajes) },
    { label: 'Documentos este mes', value: formatNumber(metrics.documentos) },
    { label: 'Personas activas', value: formatNumber(metrics.personasActivas) },
    { label: 'Personas en el espacio', value: formatNumber(members.length) },
    { label: 'Tokens de entrada', value: formatNumber(metrics.tokensEntrada) },
    { label: 'Tokens de salida', value: formatNumber(metrics.tokensSalida) },
  ];

  return (
    <div style={{ display: 'grid', gap: 'var(--cian-section-gap)' }}>
      <section aria-labelledby="resumen">
        <h2 id="resumen" className="text-lg font-semibold tracking-tight">
          Desde el {new Intl.DateTimeFormat('es-MX', {
            day: 'numeric',
            month: 'long',
          }).format(metrics.periodStart)}
        </h2>

        <div
          className="mt-3"
          style={{
            display: 'grid',
            gap: 'var(--cian-gap)',
            gridTemplateColumns: 'repeat(auto-fit, minmax(11rem, 1fr))',
          }}
        >
          {cards.map((card) => (
            <Card key={card.label}>
              <p className="text-xs text-muted-foreground">{card.label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{card.value}</p>
            </Card>
          ))}
        </div>
      </section>

      <section aria-labelledby="modelos">
        <h2 id="modelos" className="text-lg font-semibold tracking-tight">
          Por modelo
        </h2>

        <Card className="mt-3">
          {metrics.porModelo.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todavía no hay consumo registrado este mes.
            </p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="w-full text-sm">
                <caption className="sr-only">
                  Consumo por modelo en el periodo actual
                </caption>
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th scope="col" className="pb-2 pr-4 font-medium">Modelo</th>
                    <th scope="col" className="pb-2 pr-4 font-medium">Llamadas</th>
                    <th scope="col" className="pb-2 pr-4 font-medium">Entrada</th>
                    <th scope="col" className="pb-2 font-medium">Salida</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.porModelo.map((row) => (
                    <tr key={row.model} className="border-t border-border">
                      <td className="py-2 pr-4">{row.model}</td>
                      <td className="py-2 pr-4 tabular-nums">{formatNumber(row.eventos)}</td>
                      <td className="py-2 pr-4 tabular-nums">{formatNumber(row.tokensIn)}</td>
                      <td className="py-2 tabular-nums">{formatNumber(row.tokensOut)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </section>

      <section aria-labelledby="miembros">
        <h2 id="miembros" className="text-lg font-semibold tracking-tight">
          Personas del espacio
        </h2>

        <Card className="mt-3">
          <ul className="space-y-1">
            {members.map((member) => (
              <li key={member.userId} className="flex justify-between gap-3 text-sm">
                <span>{member.name ?? member.email ?? 'Sin nombre'}</span>
                <span className="text-xs text-muted-foreground">
                  {member.role} · {member.status}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </section>
    </div>
  );
}
