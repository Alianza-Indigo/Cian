'use server';

import { revalidatePath } from 'next/cache';
import { requireTenantContext } from '../tenant/context';
import { updateFoodProfile } from '../db/repositories/nutrition';
import { findViolations } from './guardrail';

export type FoodActionResult = { ok: true } | { ok: false; error: string };

/**
 * Agrega un alimento al perfil.
 *
 * El barandal aplica también aquí, aunque lo escriba una persona y no el
 * modelo. La diferencia está en el mensaje: a la persona se le explica qué
 * hace CIAN y qué no, sin regañarla.
 */
export async function addFoodAction(
  field: 'accepted' | 'avoided',
  value: string,
): Promise<FoodActionResult> {
  const trimmed = value.trim();
  if (trimmed.length === 0) return { ok: false, error: 'Escribe algo primero.' };

  const violations = findViolations(trimmed);
  if (violations.length > 0) {
    return {
      ok: false,
      error:
        'Anota solo el nombre del alimento, sin cantidades ni medidas. ' +
        'CIAN organiza la alimentación, pero no maneja porciones: eso ' +
        'corresponde a una persona profesional de la nutrición.',
    };
  }

  try {
    const ctx = await requireTenantContext();
    await updateFoodProfile(ctx, {
      ...(field === 'accepted' ? { accepted: [trimmed] } : { avoided: [trimmed] }),
    });
    revalidatePath('/alimentacion');
    return { ok: true };
  } catch {
    return { ok: false, error: 'No pudimos guardarlo. Vuelve a intentarlo.' };
  }
}
