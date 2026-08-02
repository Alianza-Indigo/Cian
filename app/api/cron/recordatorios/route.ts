/**
 * Barrido de recordatorios.
 *
 * Lo llama Vercel Cron una vez al día (ver `vercel.json`). Lee todos los
 * recordatorios activos, decide cuáles tocan hoy y despacha.
 *
 * Cerrada con `CRON_SECRET`, como el reindexado: sin el secreto configurado la
 * ruta se niega a correr. Aquí importa más todavía, porque una llamada suelta
 * enviaría notificaciones reales a dispositivos reales.
 */
import { runSweep } from '@/lib/notifications/dispatch';
import { listActiveRemindersForSweep } from '@/lib/db/repositories/notifications';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return Response.json(
      {
        error:
          'CRON_SECRET no está configurado. La ruta no corre sin él: dejarla ' +
          'abierta permitiría a cualquiera disparar notificaciones.',
      },
      { status: 503 },
    );
  }

  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'No autorizado.' }, { status: 401 });
  }

  const candidates = await listActiveRemindersForSweep();
  const summary = await runSweep(candidates, new Date());

  return Response.json(summary, {
    status: 200,
    headers: { 'Cache-Control': 'no-store' },
  });
}
