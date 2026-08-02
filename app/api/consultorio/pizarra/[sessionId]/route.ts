/**
 * La pizarra de una sesión, para que la otra parte vea lo que se dibuja.
 *
 * Es una ruta y no una server action porque se consulta cada pocos segundos
 * mientras la sesión está abierta: una acción arrastraría la revalidación del
 * árbol de React en cada sondeo, que para preguntar «¿cambió algo?» es
 * carísimo.
 *
 * Comprueba tenant y participación en cada petición, como todo lo demás del
 * consultorio: `readWhiteboard` pasa por `getSessionForParticipant`, así que
 * una sesión de la que quien pregunta no es parte devuelve la pizarra vacía y
 * no un error que confirme que existe.
 */
import { requireTenantContext } from '@/lib/tenant/context';
import { readWhiteboard } from '@/lib/db/repositories/consultorio';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
): Promise<Response> {
  const { sessionId } = await params;

  const ctx = await requireTenantContext();
  const { state, revision } = await readWhiteboard(ctx, sessionId);

  return Response.json(
    { strokes: state.strokes, revision },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
