/**
 * Webhook de Stripe. Fase 9.
 *
 * Criterio del PRD: «contratar, renovar, fallar el pago y cancelar reflejan el
 * estado correcto en la app». Los cuatro llegan por aquí.
 *
 * ## Dos cosas que no se pueden hacer distinto
 *
 * 1. **El cuerpo se lee crudo, antes de parsear nada.** La firma se calcula
 *    sobre los bytes exactos que envió Stripe; parsear y reserializar el JSON
 *    cambia espacios y orden de claves, y la firma deja de coincidir.
 * 2. **Sin `STRIPE_WEBHOOK_SECRET` la ruta se niega a correr.** Un webhook de
 *    pagos sin verificar es una puerta abierta: cualquiera que conozca la URL
 *    podría declarar que pagó y darse un plan.
 *
 * Se responde 200 a lo que no se sabe atender. Stripe reintenta lo que no
 * recibe 2xx, y reintentar indefinidamente un evento que nunca vamos a
 * procesar solo llena su cola de errores.
 */
import {
  HANDLED_EVENTS,
  tenantIdFromEvent,
  toSubscriptionStatus,
  verifyWebhookSignature,
  type StripeEvent,
} from '@/lib/billing/stripe';
import {
  findTenantByStripeIds,
  syncSubscriptionFromStripe,
} from '@/lib/db/repositories/billing';
import { PLANS, BILLING_CYCLES } from '@/lib/billing/types';
import type { BillingCycle, Plan } from '@/lib/billing/types';

export const runtime = 'nodejs';

function json(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Stripe manda las fechas como segundos epoch. */
function asDate(value: unknown): Date | null {
  return typeof value === 'number' && Number.isFinite(value)
    ? new Date(value * 1000)
    : null;
}

function planFromMetadata(object: Record<string, unknown>): Plan {
  const metadata = object.metadata as Record<string, unknown> | undefined;
  const candidate = metadata?.plan;

  return PLANS.includes(candidate as Plan) ? (candidate as Plan) : 'personal';
}

function cycleFromMetadata(object: Record<string, unknown>): BillingCycle | null {
  const metadata = object.metadata as Record<string, unknown> | undefined;
  const candidate = metadata?.cycle;

  return BILLING_CYCLES.includes(candidate as BillingCycle)
    ? (candidate as BillingCycle)
    : null;
}

/** Cuántos asientos se compraron, leídos de la primera línea de la suscripción. */
function seatsFrom(object: Record<string, unknown>): number {
  const items = object.items as { data?: Array<{ quantity?: unknown }> } | undefined;
  const quantity = items?.data?.[0]?.quantity;

  return typeof quantity === 'number' && quantity > 0 ? quantity : 1;
}

async function resolveTenantId(
  object: Record<string, unknown>,
): Promise<string | null> {
  const fromMetadata = tenantIdFromEvent(object);
  if (fromMetadata) return fromMetadata;

  // Los eventos de renovación y de fallo de pago no repiten los metadatos:
  // se busca por los identificadores que ya guardamos.
  return findTenantByStripeIds({
    subscriptionId:
      asString(object.subscription) ?? asString(object.id) ?? null,
    customerId: asString(object.customer),
  });
}

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secret) {
    return json(
      {
        error:
          'STRIPE_WEBHOOK_SECRET no está configurado. La ruta no corre sin él: ' +
          'sin firma, cualquiera podría declarar que pagó.',
      },
      503,
    );
  }

  // Crudo, byte a byte. Ver el comentario de arriba.
  const payload = await request.text();

  const verdict = verifyWebhookSignature({
    payload,
    header: request.headers.get('stripe-signature'),
    secret,
    nowSeconds: Math.floor(Date.now() / 1000),
  });

  if (!verdict.valid) {
    console.error('[stripe-webhook] firma rechazada:', verdict.reason);
    return json({ error: 'Firma no válida.' }, 400);
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(payload) as StripeEvent;
  } catch {
    return json({ error: 'Cuerpo ilegible.' }, 400);
  }

  if (!HANDLED_EVENTS.has(event.type)) {
    return json({ ignorado: event.type }, 200);
  }

  const object = event.data?.object ?? {};
  const tenantId = await resolveTenantId(object);

  if (!tenantId) {
    // Sin tenant no hay nada que actualizar. Se responde 200 para que Stripe
    // no reintente eternamente algo que no vamos a poder resolver.
    console.error('[stripe-webhook] sin tenant para', event.type, event.id);
    return json({ ignorado: 'sin tenant' }, 200);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        /*
         * La sesión completada confirma el pago pero todavía no trae el estado
         * de la suscripción. Se guarda lo que sí trae —cliente y suscripción—
         * y el estado definitivo llega en `customer.subscription.created`, que
         * Stripe envía a continuación.
         */
        await syncSubscriptionFromStripe({
          tenantId,
          stripeCustomerId: asString(object.customer),
          stripeSubscriptionId: asString(object.subscription),
          plan: planFromMetadata(object),
          cycle: cycleFromMetadata(object),
          status: 'activa',
          seats: 1,
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
        });
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        await syncSubscriptionFromStripe({
          tenantId,
          stripeCustomerId: asString(object.customer),
          stripeSubscriptionId: asString(object.id),
          plan: planFromMetadata(object),
          cycle: cycleFromMetadata(object),
          status: toSubscriptionStatus(String(object.status ?? '')),
          seats: seatsFrom(object),
          currentPeriodEnd: asDate(object.current_period_end),
          cancelAtPeriodEnd: object.cancel_at_period_end === true,
        });
        break;
      }

      case 'customer.subscription.deleted': {
        await syncSubscriptionFromStripe({
          tenantId,
          stripeCustomerId: asString(object.customer),
          stripeSubscriptionId: asString(object.id),
          plan: planFromMetadata(object),
          cycle: cycleFromMetadata(object),
          status: 'cancelada',
          seats: seatsFrom(object),
          currentPeriodEnd: asDate(object.current_period_end),
          cancelAtPeriodEnd: false,
        });
        break;
      }

      case 'invoice.payment_failed': {
        /*
         * No corta el acceso: `pago_pendiente` sigue dando servicio a
         * propósito. Stripe reintenta el cobro durante días, y quitarle las
         * herramientas a una familia por una tarjeta vencida sería
         * desproporcionado.
         */
        await syncSubscriptionFromStripe({
          tenantId,
          stripeCustomerId: asString(object.customer),
          stripeSubscriptionId: asString(object.subscription),
          plan: planFromMetadata(object),
          cycle: cycleFromMetadata(object),
          status: 'pago_pendiente',
          seats: 1,
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
        });
        break;
      }
    }
  } catch (error) {
    console.error('[stripe-webhook] fallo al aplicar', event.type, error);
    // 500 sí: Stripe reintenta, y este es un fallo nuestro que puede pasar.
    return json({ error: 'No pudimos aplicar el evento.' }, 500);
  }

  return json({ aplicado: event.type }, 200);
}
