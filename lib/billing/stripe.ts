/**
 * Stripe por su API REST. Fase 9.
 *
 * ## Sin SDK
 *
 * El paquete `stripe` no está en la lista de dependencias autorizadas del PRD
 * (sección 2), igual que pasó con `web-push` y con el SDK de Resend en la
 * Fase 8. Lo que se usa de Stripe aquí son tres llamadas HTTP y una
 * comprobación de firma; el SDK no aporta nada que `fetch` y `node:crypto` no
 * hagan.
 *
 * ## La parte delicada es la firma del webhook
 *
 * Un webhook de pagos sin verificar es una puerta abierta: cualquiera que
 * conozca la URL puede declarar que pagó. La verificación es HMAC-SHA256 sobre
 * `"{timestamp}.{cuerpo crudo}"` con el secreto `whsec_…`, comparada en tiempo
 * constante, más una tolerancia temporal para que una firma capturada no valga
 * para siempre.
 *
 * **El cuerpo tiene que ser el crudo, byte a byte.** Si se parsea el JSON y se
 * vuelve a serializar, la firma deja de coincidir y todo webhook legítimo se
 * rechaza. Por eso la ruta lee `await request.text()` antes de tocar nada.
 *
 * ## Degradación
 *
 * Sin `STRIPE_SECRET_KEY` la aplicación **no falla**: `stripeConfigured()`
 * devuelve `false`, la pantalla de membresía lo dice y todo el mundo se queda
 * en el plan gratuito, que es un plan completo. Cobrar es lo último que debe
 * romperse.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { BillingCycle, Plan, SubscriptionStatus } from './types';

const STRIPE_API = 'https://api.stripe.com/v1';
const STRIPE_VERSION = '2024-06-20';

/** Ventana de validez de una firma de webhook. La que recomienda Stripe. */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function webhookConfigured(): boolean {
  return Boolean(process.env.STRIPE_WEBHOOK_SECRET);
}

/**
 * El identificador de precio de cada plan y ciclo.
 *
 * Vive en variables de entorno y no en la base porque son identificadores del
 * proveedor, no configuración de producto: cambian al cambiar de cuenta de
 * Stripe, no al cambiar de estrategia comercial.
 */
export function priceIdFor(plan: Plan, cycle: BillingCycle): string | null {
  const key = `STRIPE_PRICE_${plan.toUpperCase()}_${cycle.toUpperCase()}`;
  return process.env[key] ?? null;
}

// --- Codificación de formularios --------------------------------------------

/**
 * Stripe recibe `application/x-www-form-urlencoded` con corchetes para lo
 * anidado: `line_items[0][price]=price_123`. No es JSON y no lo acepta.
 */
export function encodeForm(
  value: unknown,
  prefix = '',
  target: string[] = [],
): string {
  if (value === null || value === undefined) return target.join('&');

  if (Array.isArray(value)) {
    value.forEach((item, index) => encodeForm(item, `${prefix}[${index}]`, target));
    return target.join('&');
  }

  if (typeof value === 'object') {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      encodeForm(item, prefix ? `${prefix}[${key}]` : key, target);
    }
    return target.join('&');
  }

  target.push(`${encodeURIComponent(prefix)}=${encodeURIComponent(String(value))}`);
  return target.join('&');
}

export type StripeResult<T> =
  | { ok: true; data: T }
  | { ok: false; configured: boolean; error: string };

async function stripeRequest<T>(
  path: string,
  body: Record<string, unknown> | null,
): Promise<StripeResult<T>> {
  const key = process.env.STRIPE_SECRET_KEY;

  if (!key) {
    return {
      ok: false,
      configured: false,
      error: 'Los pagos no están configurados todavía.',
    };
  }

  try {
    // `null` = lectura. Stripe usa GET sin cuerpo para consultar un recurso.
    const response = await fetch(`${STRIPE_API}${path}`, {
      method: body === null ? 'GET' : 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Stripe-Version': STRIPE_VERSION,
      },
      ...(body === null ? {} : { body: encodeForm(body) }),
    });

    const payload = (await response.json()) as Record<string, unknown>;

    if (!response.ok) {
      const error = payload.error as { message?: string } | undefined;
      // El mensaje de Stripe viene en inglés y a veces con detalles internos;
      // se registra pero no se le enseña tal cual a la persona.
      console.error('[stripe]', response.status, error?.message);
      return {
        ok: false,
        configured: true,
        error: 'No pudimos conectar con el sistema de pagos. Inténtalo de nuevo.',
      };
    }

    return { ok: true, data: payload as T };
  } catch (error) {
    console.error('[stripe]', error);
    return {
      ok: false,
      configured: true,
      error: 'No pudimos conectar con el sistema de pagos. Inténtalo de nuevo.',
    };
  }
}

// --- Checkout y portal -------------------------------------------------------

export async function createCheckoutSession(input: {
  priceId: string;
  tenantId: string;
  plan: Plan;
  cycle: BillingCycle;
  customerEmail: string | null;
  customerId: string | null;
  successUrl: string;
  cancelUrl: string;
  seats: number;
}): Promise<StripeResult<{ url: string }>> {
  const body: Record<string, unknown> = {
    mode: 'subscription',
    line_items: [{ price: input.priceId, quantity: Math.max(1, input.seats) }],
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    /*
     * El tenant viaja en los metadatos de la suscripción, no solo de la
     * sesión: los eventos posteriores —renovación, fallo de pago, baja— llegan
     * con la suscripción y no con la sesión, y sin esto no habría forma de
     * saber a quién corresponden.
     */
    subscription_data: {
      metadata: { tenant_id: input.tenantId, plan: input.plan, cycle: input.cycle },
    },
    metadata: { tenant_id: input.tenantId, plan: input.plan, cycle: input.cycle },
    allow_promotion_codes: true,
    ...(input.customerId
      ? { customer: input.customerId }
      : input.customerEmail
        ? { customer_email: input.customerEmail }
        : {}),
  };

  const result = await stripeRequest<{ url?: string }>('/checkout/sessions', body);
  if (!result.ok) return result;

  if (!result.data.url) {
    return { ok: false, configured: true, error: 'Stripe no devolvió un enlace de pago.' };
  }

  return { ok: true, data: { url: result.data.url } };
}

export async function createPortalSession(input: {
  customerId: string;
  returnUrl: string;
}): Promise<StripeResult<{ url: string }>> {
  const result = await stripeRequest<{ url?: string }>('/billing_portal/sessions', {
    customer: input.customerId,
    return_url: input.returnUrl,
  });

  if (!result.ok) return result;

  if (!result.data.url) {
    return { ok: false, configured: true, error: 'Stripe no devolvió el portal.' };
  }

  return { ok: true, data: { url: result.data.url } };
}

/**
 * Lee una suscripción tal como está **ahora mismo** en Stripe.
 *
 * La usa el reconciliador. El webhook es el camino normal y este es el de
 * seguridad: un webhook puede perderse —Stripe reintenta y se rinde, la
 * aplicación puede estar caída durante un despliegue, el secreto puede rotarse
 * a mitad—, y el resultado sería una suscripción cancelada hace un mes que en
 * la base sigue activa, o al revés: alguien que pagó y no tiene su plan.
 */
export async function fetchSubscription(
  subscriptionId: string,
): Promise<StripeResult<Record<string, unknown>>> {
  return stripeRequest<Record<string, unknown>>(
    `/subscriptions/${encodeURIComponent(subscriptionId)}`,
    null,
  );
}

// --- Verificación de la firma ------------------------------------------------

export type SignatureVerdict =
  | { valid: true }
  | { valid: false; reason: string };

/**
 * Comprueba la cabecera `Stripe-Signature`.
 *
 * El formato es `t=1690000000,v1=abc…,v1=def…`: puede traer varias firmas `v1`
 * durante una rotación de secreto, y basta con que una coincida.
 *
 * `now` se recibe en vez de leerse del reloj para poder probar la tolerancia
 * sin manipular el tiempo del sistema.
 */
export function verifyWebhookSignature(input: {
  payload: string;
  header: string | null;
  secret: string;
  nowSeconds: number;
  toleranceSeconds?: number;
}): SignatureVerdict {
  if (!input.header) return { valid: false, reason: 'Falta la firma.' };

  let timestamp: number | null = null;
  const signatures: string[] = [];

  for (const part of input.header.split(',')) {
    const [key, value] = part.trim().split('=', 2);
    if (!value) continue;
    if (key === 't') timestamp = Number(value);
    else if (key === 'v1') signatures.push(value);
  }

  if (timestamp === null || Number.isNaN(timestamp)) {
    return { valid: false, reason: 'La firma no trae marca de tiempo.' };
  }

  if (signatures.length === 0) {
    return { valid: false, reason: 'La firma no trae ninguna versión v1.' };
  }

  const tolerance = input.toleranceSeconds ?? SIGNATURE_TOLERANCE_SECONDS;
  if (Math.abs(input.nowSeconds - timestamp) > tolerance) {
    // Sin esto, una firma capturada una vez valdría para siempre.
    return { valid: false, reason: 'La firma está fuera de la ventana de tiempo.' };
  }

  const expected = createHmac('sha256', input.secret)
    .update(`${timestamp}.${input.payload}`, 'utf8')
    .digest('hex');

  const expectedBuffer = Buffer.from(expected, 'utf8');

  const matches = signatures.some((signature) => {
    const candidate = Buffer.from(signature, 'utf8');
    // `timingSafeEqual` exige la misma longitud; distinta longitud ya es un no.
    return (
      candidate.length === expectedBuffer.length &&
      timingSafeEqual(candidate, expectedBuffer)
    );
  });

  return matches ? { valid: true } : { valid: false, reason: 'La firma no coincide.' };
}

// --- Traducción de los eventos ----------------------------------------------

/**
 * De los estados de Stripe a los cinco que le importan a CIAN.
 *
 * Lo desconocido cae en `incompleta`, que es el estado que **no** da acceso.
 * Ante un estado que no sabemos leer, la respuesta segura es no conceder nada
 * y que se note, no adivinar hacia el lado generoso.
 */
export function toSubscriptionStatus(stripeStatus: string): SubscriptionStatus {
  switch (stripeStatus) {
    case 'active':
      return 'activa';
    case 'trialing':
      return 'periodo_de_prueba';
    case 'past_due':
    case 'unpaid':
      return 'pago_pendiente';
    case 'canceled':
      return 'cancelada';
    default:
      return 'incompleta';
  }
}

export type StripeEvent = {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
};

/** Los eventos que la aplicación sabe atender. El resto se ignora sin ruido. */
export const HANDLED_EVENTS = new Set([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.payment_failed',
]);

/** Lee `metadata.tenant_id` esté donde esté en el objeto del evento. */
export function tenantIdFromEvent(object: Record<string, unknown>): string | null {
  const metadata = object.metadata as Record<string, unknown> | undefined;
  const direct = metadata?.tenant_id;
  if (typeof direct === 'string' && direct.length > 0) return direct;

  const subscription = object.subscription_details as
    | { metadata?: Record<string, unknown> }
    | undefined;
  const nested = subscription?.metadata?.tenant_id;

  return typeof nested === 'string' && nested.length > 0 ? nested : null;
}
