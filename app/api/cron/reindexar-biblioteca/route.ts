/**
 * Reindexado de la biblioteca.
 *
 * Lo llama Vercel Cron (ver `vercel.json`). También puede dispararse a mano
 * con el secreto, para no tener que esperar al siguiente ciclo tras publicar
 * contenido nuevo.
 *
 * Vercel firma sus llamadas de cron con `CRON_SECRET`. Sin ese secreto
 * configurado la ruta **se niega a correr**: dejarla abierta permitiría a
 * cualquiera provocar el costo de reindexar la biblioteca entera.
 */
import { indexLibrary } from '@/lib/library/index-content';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return Response.json(
      {
        error:
          'CRON_SECRET no está configurado. La ruta no corre sin él, para que ' +
          'nadie pueda disparar el reindexado desde fuera.',
      },
      { status: 503 },
    );
  }

  const authorization = request.headers.get('authorization');
  if (authorization !== `Bearer ${secret}`) {
    return Response.json({ error: 'No autorizado.' }, { status: 401 });
  }

  const report = await indexLibrary();

  return Response.json(report, {
    status: report.errors.length > 0 ? 207 : 200,
    headers: { 'Cache-Control': 'no-store' },
  });
}
