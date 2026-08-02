'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireTenantContext } from '../tenant/context';
import {
  deleteCrisisEvent,
  deleteCrisisProtocol,
  setProtocolActive,
} from '../db/repositories/crisis';

export type CrisisActionResult = { ok: true } | { ok: false; error: string };

const idSchema = z.uuid();

/**
 * Borrar un episodio de la bitácora.
 *
 * Sin papelera ni confirmación diferida: la bitácora de crisis es de quien la
 * vive, y si decide que algo no debe quedar registrado, se va. Guardar «por si
 * acaso» lo que alguien pidió borrar es exactamente lo que no queremos hacer
 * con estos datos.
 */
export async function deleteCrisisEventAction(
  eventId: string,
): Promise<CrisisActionResult> {
  if (!idSchema.safeParse(eventId).success) {
    return { ok: false, error: 'Episodio no válido.' };
  }

  try {
    const ctx = await requireTenantContext();
    await deleteCrisisEvent(ctx, eventId);
    revalidatePath('/crisis');
    return { ok: true };
  } catch {
    return { ok: false, error: 'No pudimos borrar el episodio.' };
  }
}

export async function setProtocolActiveAction(
  protocolId: string,
  active: boolean,
): Promise<CrisisActionResult> {
  if (!idSchema.safeParse(protocolId).success) {
    return { ok: false, error: 'Protocolo no válido.' };
  }

  try {
    const ctx = await requireTenantContext();
    await setProtocolActive(ctx, protocolId, active);
    revalidatePath('/crisis');
    return { ok: true };
  } catch {
    return { ok: false, error: 'No pudimos actualizar el protocolo.' };
  }
}

export async function deleteCrisisProtocolAction(
  protocolId: string,
): Promise<CrisisActionResult> {
  if (!idSchema.safeParse(protocolId).success) {
    return { ok: false, error: 'Protocolo no válido.' };
  }

  try {
    const ctx = await requireTenantContext();
    await deleteCrisisProtocol(ctx, protocolId);
    revalidatePath('/crisis');
    return { ok: true };
  } catch {
    return { ok: false, error: 'No pudimos borrar el protocolo.' };
  }
}
