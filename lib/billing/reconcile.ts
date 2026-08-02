/**
 * Reconciliador de suscripciones. Cierra el pendiente de la Fase 9.
 *
 * ## Por qué hace falta si ya hay webhook
 *
 * El webhook es el camino normal y es fiable **casi** siempre. Casi no basta
 * cuando lo que está en juego es si una familia tiene o no acceso a sus cosas:
 *
 * - Stripe reintenta un webhook fallido durante unas horas y luego se rinde.
 *   Si el despliegue de esa tarde tardó más de la cuenta, ese evento se pierde
 *   para siempre.
 * - Rotar `STRIPE_WEBHOOK_SECRET` deja fuera todo lo que llegue entre el cambio
 *   en Stripe y el cambio en las variables de entorno.
 * - Un cambio hecho a mano desde el panel de Stripe —una cancelación por
 *   soporte, un cambio de plan— puede no generar el evento que esperamos.
 *
 * El resultado de cualquiera de las tres es el mismo y es feo por los dos
 * lados: una suscripción cancelada hace un mes que aquí sigue activa, o alguien
 * que pagó y no tiene su plan.
 *
 * ## Qué hace y qué no
 *
 * Pregunta a Stripe por cada suscripción que conocemos y, si lo que dice no
 * coincide con lo que tenemos, escribe lo que dice Stripe. **Stripe es la
 * verdad**: es quien cobró.
 *
 * Lo que no hace: no cancela nada en Stripe, no cobra, no crea suscripciones.
 * Solo lee y ajusta lo nuestro. Un reconciliador que además escribe en el
 * proveedor puede convertir un error de lectura en un cobro.
 *
 * La comparación vive aparte, en `differs()`, y es pura: se puede probar sin
 * red y sin base de datos, que es lo único que se puede probar de esto en un
 * entorno sin acceso a Stripe.
 */
import { fetchSubscription, toSubscriptionStatus } from './stripe';
import {
  listSubscriptionsToReconcile,
  syncSubscriptionFromStripe,
} from '../db/repositories/billing';
import { BILLING_CYCLES, PLANS } from './types';
import type { BillingCycle, Plan, SubscriptionStatus } from './types';

export type KnownState = {
  plan: Plan;
  status: SubscriptionStatus;
  seats: number;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
};

export type RemoteState = KnownState & {
  cycle: BillingCycle | null;
  stripeCustomerId: string | null;
};

/**
 * Si lo que tenemos difiere de lo que dice Stripe.
 *
 * El fin de periodo se compara al segundo y no al milisegundo: Stripe lo manda
 * en segundos epoch, así que los milisegundos que pudiera tener nuestra fila
 * serían ruido y provocarían una escritura en cada barrido.
 */
export function differs(known: KnownState, remote: KnownState): boolean {
  if (known.plan !== remote.plan) return true;
  if (known.status !== remote.status) return true;
  if (known.seats !== remote.seats) return true;
  if (known.cancelAtPeriodEnd !== remote.cancelAtPeriodEnd) return true;

  const knownEnd = known.currentPeriodEnd
    ? Math.floor(known.currentPeriodEnd.getTime() / 1000)
    : null;
  const remoteEnd = remote.currentPeriodEnd
    ? Math.floor(remote.currentPeriodEnd.getTime() / 1000)
    : null;

  return knownEnd !== remoteEnd;
}

/** Lee el objeto de Stripe con los mismos criterios que el webhook. */
export function parseRemote(object: Record<string, unknown>): RemoteState {
  const metadata = (object.metadata ?? {}) as Record<string, unknown>;

  const plan = PLANS.includes(metadata.plan as Plan)
    ? (metadata.plan as Plan)
    : 'personal';

  const cycle = BILLING_CYCLES.includes(metadata.cycle as BillingCycle)
    ? (metadata.cycle as BillingCycle)
    : null;

  const items = object.items as
    | { data?: Array<{ quantity?: unknown }> }
    | undefined;
  const quantity = items?.data?.[0]?.quantity;

  const periodEnd = object.current_period_end;

  return {
    plan,
    cycle,
    status: toSubscriptionStatus(String(object.status ?? '')),
    seats: typeof quantity === 'number' && quantity > 0 ? quantity : 1,
    currentPeriodEnd:
      typeof periodEnd === 'number' && Number.isFinite(periodEnd)
        ? new Date(periodEnd * 1000)
        : null,
    cancelAtPeriodEnd: object.cancel_at_period_end === true,
    stripeCustomerId:
      typeof object.customer === 'string' && object.customer.length > 0
        ? object.customer
        : null,
  };
}

export type ReconcileReport = {
  checked: number;
  corrected: number;
  unreachable: number;
  /** `true` si Stripe no está configurado y no se hizo nada. */
  skipped: boolean;
};

export async function reconcileSubscriptions(): Promise<ReconcileReport> {
  const report: ReconcileReport = {
    checked: 0,
    corrected: 0,
    unreachable: 0,
    skipped: false,
  };

  const rows = await listSubscriptionsToReconcile();
  if (rows.length === 0) return report;

  for (const row of rows) {
    const result = await fetchSubscription(row.stripeSubscriptionId);

    if (!result.ok) {
      if (!result.configured) {
        // Sin clave no hay nada que reconciliar y no tiene sentido seguir
        // intentándolo con las demás filas.
        return { ...report, skipped: true };
      }

      /*
       * Un fallo de red o un 404 no se toca. Bajar a `cancelada` por no poder
       * leer sería quitarle el acceso a alguien porque Stripe tuvo un mal
       * minuto. Se cuenta y se vuelve a intentar en el siguiente barrido.
       */
      report.unreachable += 1;
      continue;
    }

    report.checked += 1;
    const remote = parseRemote(result.data);

    if (!differs(row, remote)) continue;

    await syncSubscriptionFromStripe({
      tenantId: row.tenantId,
      stripeCustomerId: remote.stripeCustomerId,
      stripeSubscriptionId: row.stripeSubscriptionId,
      plan: remote.plan,
      cycle: remote.cycle,
      status: remote.status,
      seats: remote.seats,
      currentPeriodEnd: remote.currentPeriodEnd,
      cancelAtPeriodEnd: remote.cancelAtPeriodEnd,
    });

    report.corrected += 1;
  }

  return report;
}
