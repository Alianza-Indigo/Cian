'use server';

/**
 * Acciones del espacio de trabajo profesional.
 *
 * Aparte de `./actions` porque son de otra naturaleza: aquellas ocurren dentro
 * de una sesión, estas organizan la consulta. El repositorio vuelve a comprobar
 * todo; estas funciones son la puerta, no la cerradura.
 */

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireTenantContext } from '../tenant/context';
import { proposeAppointment } from '../db/repositories/practice';
import { recordAudit } from '../db/repositories/audit';

export type PracticeActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };

const proposeSchema = z.object({
  clientUserId: z.string().min(1).max(255),
  /** Instante ISO construido en el navegador, en la zona de quien agenda. */
  scheduledAt: z.string().min(1),
  durationMinutes: z.number().int().min(15).max(240),
  reason: z.string().max(500).optional(),
});

/**
 * Propone una cita a alguien a quien ya se atiende.
 *
 * Nace **sin confirmar**: proponer no es agendar. Meter una cita confirmada en
 * la agenda de otra persona sin que haya dicho que sí sería exactamente lo que
 * este producto no debe hacer.
 */
export async function proposeAppointmentAction(
  input: unknown,
): Promise<PracticeActionResult> {
  const parsed = proposeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Revisa la fecha y la duración.' };
  }

  const scheduledAt = new Date(parsed.data.scheduledAt);
  if (Number.isNaN(scheduledAt.getTime())) {
    return { ok: false, error: 'Esa fecha no es válida.' };
  }

  try {
    const ctx = await requireTenantContext();

    const appointment = await proposeAppointment(ctx, {
      clientUserId: parsed.data.clientUserId,
      scheduledAt,
      durationMinutes: parsed.data.durationMinutes,
      reason: parsed.data.reason ?? null,
    });

    await recordAudit(ctx, {
      action: 'consultorio.propose',
      entity: 'appointment',
      entityId: appointment.id,
    });

    revalidatePath('/profesional');
    revalidatePath(`/profesional/personas/${parsed.data.clientUserId}`);

    return {
      ok: true,
      message:
        'Propuesta enviada. Aparecerá en su consultorio y no queda agendada ' +
        'hasta que la confirme.',
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'No pudimos proponerla.',
    };
  }
}
