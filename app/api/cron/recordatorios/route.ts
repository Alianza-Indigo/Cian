/**
 * Barrido de recordatorios.
 *
 * Lo llama Vercel Cron una vez al día (ver `vercel.json`). Lee todos los
 * recordatorios activos, decide cuáles tocan hoy y despacha. En la misma
 * pasada avisa de las citas de hoy y de mañana, que comparten con los
 * recordatorios los dispositivos, el respaldo por correo y el registro.
 *
 * Cerrada con `CRON_SECRET`, como el reindexado: sin el secreto configurado la
 * ruta se niega a correr. Aquí importa más todavía, porque una llamada suelta
 * enviaría notificaciones reales a dispositivos reales.
 */
import { runSweep } from '@/lib/notifications/dispatch';
import { runAppointmentSweep } from '@/lib/notifications/appointment-sweep';
import {
  listActiveRemindersForSweep,
  listAppointmentsForNotice,
} from '@/lib/db/repositories/notifications';

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

  /*
   * Los dos barridos comparten el cron y el instante.
   *
   * El mismo `now` para ambos no es cosmético: los dos deciden por clave de día
   * local, y si uno cruzara la medianoche mientras corre el otro, un aviso
   * podría contarse en dos días distintos.
   */
  const now = new Date();

  const [candidates, appointments] = await Promise.all([
    listActiveRemindersForSweep(),
    listAppointmentsForNotice(now),
  ]);

  const summary = await runSweep(candidates, now);
  const citas = await runAppointmentSweep(appointments, now);

  return Response.json({ ...summary, citas }, {
    status: 200,
    headers: { 'Cache-Control': 'no-store' },
  });
}
