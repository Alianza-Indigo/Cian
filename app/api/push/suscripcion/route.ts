/**
 * Alta y baja de suscripciones de push.
 *
 * El navegador produce la suscripción con `PushManager.subscribe()` y la
 * manda aquí. La clave pública de VAPID se sirve en `GET` para que el cliente
 * no tenga que llevarla incrustada en el bundle: rotarla no exige redesplegar
 * la interfaz.
 */
import { z } from 'zod';
import { getTenantContext } from '@/lib/tenant/context';
import {
  deletePushSubscription,
  savePushSubscription,
} from '@/lib/db/repositories/notifications';

export const runtime = 'nodejs';

const subscriptionSchema = z.object({
  endpoint: z.url().max(2000),
  keys: z.object({
    p256dh: z.string().min(1).max(200),
    auth: z.string().min(1).max(100),
  }),
});

function json(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

/** La clave pública de VAPID. Es pública por definición: va al navegador. */
export async function GET(): Promise<Response> {
  const publicKey = process.env.VAPID_PUBLIC_KEY ?? null;
  return json({ publicKey, configurado: Boolean(publicKey) }, 200);
}

export async function POST(request: Request): Promise<Response> {
  const ctx = await getTenantContext();
  if (!ctx) return json({ error: 'Necesitas iniciar sesión.' }, 401);

  let payload: z.infer<typeof subscriptionSchema>;
  try {
    payload = subscriptionSchema.parse(await request.json());
  } catch {
    return json({ error: 'La suscripción no es válida.' }, 400);
  }

  await savePushSubscription(ctx, {
    endpoint: payload.endpoint,
    keys: payload.keys,
    userAgent: request.headers.get('user-agent'),
  });

  return json({ ok: true }, 200);
}

export async function DELETE(request: Request): Promise<Response> {
  const ctx = await getTenantContext();
  if (!ctx) return json({ error: 'Necesitas iniciar sesión.' }, 401);

  let endpoint: string;
  try {
    const body = await request.json();
    endpoint = z.url().max(2000).parse((body as { endpoint?: unknown }).endpoint);
  } catch {
    return json({ error: 'Falta la suscripción a dar de baja.' }, 400);
  }

  await deletePushSubscription(ctx, endpoint);
  return json({ ok: true }, 200);
}
