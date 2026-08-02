import type { Metadata } from 'next';
import { requireTenantContext } from '@/lib/tenant/context';
import { hasRoleAtLeast } from '@/lib/tenant/guard';
import { getSubscription } from '@/lib/db/repositories/billing';
import { planOverview } from '@/lib/billing/enforce';
import { stripeConfigured } from '@/lib/billing/stripe';
import { MembershipBoard } from './membership-board';

export const metadata: Metadata = { title: 'Membresía' };
export const dynamic = 'force-dynamic';

export default async function MembresiaPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string }>;
}) {
  const [ctx, params] = await Promise.all([requireTenantContext(), searchParams]);

  /*
   * La pantalla se puede ver siendo integrante; contratar y cancelar, no.
   *
   * Ver el plan y el consumo le sirve a cualquiera —es la respuesta a «por qué
   * no puedo subir más documentos»— y no revela nada de nadie. Lo que cambia
   * es que los botones no aparecen, y las acciones de cobro además lo
   * comprueban por su cuenta.
   */
  const canManage = hasRoleAtLeast(ctx, 'admin');

  const [{ plan, limits, usage }, subscription] = await Promise.all([
    planOverview(ctx),
    getSubscription(ctx),
  ]);

  return (
    <div style={{ display: 'grid', gap: 'var(--cian-section-gap)' }}>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Membresía</h1>
        <p className="mt-2 text-muted-foreground">
          CIAN funciona con el plan gratuito y seguirá funcionando: los planes
          de pago amplían límites, no desbloquean lo importante. El
          acompañamiento en crisis nunca depende de lo que pagues.
        </p>
      </div>

      {!canManage ? (
        <p className="text-sm text-muted-foreground">
          La membresía de este espacio la administra quien lo lleva. Aquí puedes
          ver en qué plan estás y cuánto llevas usado.
        </p>
      ) : null}

      <MembershipBoard
        canManage={canManage}
        plan={plan}
        limits={limits}
        usage={{
          mensajes: usage.mensajes,
          documentos: usage.documentos,
          almacenamiento: usage.almacenamiento,
          equipo_de_apoyo: usage.equipo_de_apoyo,
        }}
        subscription={
          subscription
            ? {
                status: subscription.status,
                cycle: subscription.cycle,
                seats: subscription.seats,
                currentPeriodEnd:
                  subscription.currentPeriodEnd?.toISOString() ?? null,
                cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
                hasCustomer: Boolean(subscription.stripeCustomerId),
              }
            : null
        }
        paymentsReady={stripeConfigured()}
        checkoutState={params.estado ?? null}
      />
    </div>
  );
}
