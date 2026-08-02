'use server';

/**
 * Acciones de administración de plataforma.
 *
 * Aparte de `./actions` porque estas cruzan espacios: cada una comprueba que
 * quien llama sea superadmin y deja constancia en el espacio afectado.
 */

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { setVerificationAnywhere } from './platform';
import { VERIFICATION_STATUSES } from '../consultorio/types';

export type PlatformActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };

const verifySchema = z.object({
  tenantId: z.uuid(),
  professionalId: z.uuid(),
  status: z.enum(VERIFICATION_STATUSES),
});

/**
 * Verifica a un profesional de cualquier espacio.
 *
 * Es la verificación de plataforma que faltaba: un espacio pequeño puede no
 * tener a nadie con criterio para revisar una cédula, y que CIAN pueda hacerlo
 * es lo que permite responder por quién atiende dentro de la plataforma.
 *
 * Sigue sin poder verificarse a quien no ha aceptado los términos, tampoco
 * desde aquí: hacerlo sería firmar por él.
 */
export async function verifyFromPlatformAction(
  input: unknown,
): Promise<PlatformActionResult> {
  const parsed = verifySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Datos no válidos.' };

  try {
    await setVerificationAnywhere(
      parsed.data.tenantId,
      parsed.data.professionalId,
      parsed.data.status,
    );

    revalidatePath(`/admin/espacios/${parsed.data.tenantId}`);
    return { ok: true, message: 'Verificación actualizada y registrada.' };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'No pudimos cambiarla.',
    };
  }
}
