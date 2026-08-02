/**
 * Reconciliación diaria de suscripciones contra Stripe.
 *
 * El webhook sigue siendo el camino normal; esto es la red debajo. Un evento
 * perdido —Stripe se rinde tras unas horas de reintentos, un despliegue largo,
 * un secreto rotado a mitad— deja una suscripción cancelada que aquí sigue
 * activa, o a alguien que pagó sin su plan. Una vez al día se comprueba.
 *
 * Cerrada con `CRON_SECRET`, como los otros barridos. Aquí la ruta no manda
 * nada a nadie, pero sí consulta Stripe una vez por suscripción, y dejarla
 * abierta sería regalar la factura de la API.
 */
import { reconcileSubscriptions } from '@/lib/billing/reconcile';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return Response.json(
      {
        error:
          'CRON_SECRET no está configurado. La ruta no corre sin él: dejarla ' +
          'abierta permitiría a cualquiera disparar consultas a Stripe.',
      },
      { status: 503 },
    );
  }

  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'No autorizado.' }, { status: 401 });
  }

  const report = await reconcileSubscriptions();

  return Response.json(report, {
    status: 200,
    headers: { 'Cache-Control': 'no-store' },
  });
}
