'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { auth } from '../auth';
import { requireTenantContext } from '../tenant/context';
import { hasRoleAtLeast } from '../tenant/guard';
import {
  getSubscription,
  saveModelConfig,
  savePlanLimits,
} from '../db/repositories/billing';
import { recordAudit } from '../db/repositories/audit';
import {
  createCheckoutSession,
  createPortalSession,
  priceIdFor,
  stripeConfigured,
} from './stripe';
import { BILLING_CYCLES, MODEL_PURPOSES, PLANS } from './types';

export type BillingActionResult =
  | { ok: true; url?: string; message?: string }
  | { ok: false; error: string };

async function baseUrl(): Promise<string> {
  const headerList = await headers();
  const host = headerList.get('host');
  const protocol = host?.startsWith('localhost') ? 'http' : 'https';
  return host ? `${protocol}://${host}` : (process.env.AUTH_URL ?? '');
}

const checkoutSchema = z.object({
  plan: z.enum(PLANS).exclude(['free']),
  cycle: z.enum(BILLING_CYCLES),
  seats: z.number().int().min(1).max(500).default(1),
});

/**
 * Abre el pago en Stripe.
 *
 * Devuelve la URL en vez de redirigir desde el servidor: así el cliente puede
 * enseñar un error legible si Stripe no responde, en lugar de dejar a la
 * persona en una página en blanco.
 */
export async function startCheckoutAction(
  input: unknown,
): Promise<BillingActionResult> {
  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Plan no válido.' };

  if (!stripeConfigured()) {
    return {
      ok: false,
      error:
        'Los pagos todavía no están configurados. Mientras tanto puedes seguir ' +
        'usando CIAN con el plan gratuito.',
    };
  }

  const priceId = priceIdFor(parsed.data.plan, parsed.data.cycle);
  if (!priceId) {
    return {
      ok: false,
      error: 'Ese plan todavía no tiene precio configurado.',
    };
  }

  try {
    const [ctx, session] = await Promise.all([requireTenantContext(), auth()]);

    /*
     * La suscripción es del espacio, no de quien la mira.
     *
     * Mientras cada persona estuvo sola en el suyo esto sobraba. Desde que se
     * puede invitar gente, sin esta comprobación cualquier integrante podía
     * contratar un plan a nombre de la organización.
     */
    if (!hasRoleAtLeast(ctx, 'admin')) {
      return {
        ok: false,
        error: 'La membresía la administra quien lleva el espacio.',
      };
    }
    const existing = await getSubscription(ctx);
    const origin = await baseUrl();

    const result = await createCheckoutSession({
      priceId,
      tenantId: ctx.tenantId,
      plan: parsed.data.plan,
      cycle: parsed.data.cycle,
      customerEmail: session?.user?.email ?? null,
      customerId: existing?.stripeCustomerId ?? null,
      successUrl: `${origin}/membresia?estado=listo`,
      cancelUrl: `${origin}/membresia?estado=cancelado`,
      seats: parsed.data.seats,
    });

    if (!result.ok) return { ok: false, error: result.error };

    await recordAudit(ctx, {
      action: 'billing.checkout_started',
      entity: 'subscription',
      metadata: { plan: parsed.data.plan, cycle: parsed.data.cycle },
    });

    return { ok: true, url: result.data.url };
  } catch {
    return { ok: false, error: 'No pudimos abrir el pago.' };
  }
}

/** Portal de Stripe: cambiar tarjeta, ver facturas, cancelar. */
/**
 * Abre el portal de Stripe.
 *
 * Solo `admin` u `owner`, y aquí importa más que en el checkout: dentro del
 * portal se cancela la suscripción y se cambia la tarjeta. Sin esta
 * comprobación, cualquier integrante de una organización podía dejar sin plan
 * a todo el mundo.
 */
export async function openBillingPortalAction(): Promise<BillingActionResult> {
  try {
    const ctx = await requireTenantContext();

    if (!hasRoleAtLeast(ctx, 'admin')) {
      return {
        ok: false,
        error: 'La membresía la administra quien lleva el espacio.',
      };
    }

    const subscription = await getSubscription(ctx);

    if (!subscription?.stripeCustomerId) {
      return {
        ok: false,
        error: 'Todavía no tienes ninguna suscripción que administrar.',
      };
    }

    const result = await createPortalSession({
      customerId: subscription.stripeCustomerId,
      returnUrl: `${await baseUrl()}/membresia`,
    });

    if (!result.ok) return { ok: false, error: result.error };
    return { ok: true, url: result.data.url };
  } catch {
    return { ok: false, error: 'No pudimos abrir el portal de facturación.' };
  }
}

// --- Panel administrativo ----------------------------------------------------

const modelSchema = z.object({
  purpose: z.enum(MODEL_PURPOSES),
  provider: z.string().min(1).max(60),
  model: z.string().min(1).max(120),
  global: z.boolean().default(false),
  active: z.boolean().default(true),
});

export async function saveModelConfigAction(
  input: unknown,
): Promise<BillingActionResult> {
  const parsed = modelSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Revisa el modelo y el proveedor.' };

  try {
    const ctx = await requireTenantContext();
    await saveModelConfig(ctx, parsed.data);

    await recordAudit(ctx, {
      action: 'admin.model_config',
      entity: 'model_config',
      metadata: {
        purpose: parsed.data.purpose,
        model: parsed.data.model,
        global: parsed.data.global,
      },
    });

    revalidatePath('/admin/modelos');
    return { ok: true, message: 'Modelo actualizado.' };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'No pudimos guardarlo.',
    };
  }
}

const limitsSchema = z.object({
  plan: z.enum(PLANS),
  limits: z.object({
    mensajes: z.number().int().min(0).nullable(),
    documentos: z.number().int().min(0).nullable(),
    almacenamiento: z.number().int().min(0).nullable(),
    equipo_de_apoyo: z.number().int().min(0).nullable(),
    asientos: z.number().int().min(1),
  }),
});

export async function savePlanLimitsAction(
  input: unknown,
): Promise<BillingActionResult> {
  const parsed = limitsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Revisa los límites.' };

  try {
    const ctx = await requireTenantContext();
    await savePlanLimits(ctx, parsed.data.plan, parsed.data.limits);

    await recordAudit(ctx, {
      action: 'admin.plan_limits',
      entity: 'plan_limits',
      metadata: { plan: parsed.data.plan },
    });

    revalidatePath('/admin/planes');
    return { ok: true, message: 'Límites actualizados.' };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'No pudimos guardarlo.',
    };
  }
}
