'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireTenantContext } from '../tenant/context';
import {
  closeCrisisEvent,
  deleteCrisisEvent,
  deleteCrisisProtocol,
  setProtocolActive,
} from '../db/repositories/crisis';
import { assertSafeCrisisContent } from './medical-guardrail';
import { CRISIS_OUTCOMES, CRISIS_SEVERITIES } from './types';

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

const manualEpisodeSchema = z.object({
  summary: z.string().min(1).max(4000),
  severity: z.enum(CRISIS_SEVERITIES),
  triggers: z.array(z.string().min(1).max(300)).max(20).default([]),
  actionsTaken: z
    .array(
      z.object({
        action: z.string().min(1).max(300),
        helped: z.boolean().nullable(),
      }),
    )
    .max(20)
    .default([]),
  outcome: z.enum(CRISIS_OUTCOMES).nullable().default(null),
});

/**
 * Registrar un episodio a mano, sin pasar por una conversación.
 *
 * El PRD deja el registro dentro del acompañamiento, y para muchas personas
 * eso basta. Pero después de una crisis intensa hay quien no quiere hablar con
 * nadie —ni con un asistente— y solo quiere anotar lo que pasó antes de que se
 * le olvide. Obligar a conversar para poder registrar convierte la bitácora en
 * algo que solo se llena cuando queda energía para explicarse.
 *
 * **Pasa por el mismo barandal médico que las tools.** Lo escribe una persona y
 * no un modelo, así que aquí no protege del modelo: protege de que la bitácora
 * acabe siendo un expediente con diagnósticos y dosis anotados por alguien que
 * no puede diagnosticar ni dosificar, y que después se comparte o se exporta.
 */
export async function logCrisisEpisodeAction(
  input: unknown,
): Promise<CrisisActionResult> {
  const parsed = manualEpisodeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Cuenta al menos qué pasó y con qué intensidad.' };
  }

  try {
    assertSafeCrisisContent([
      parsed.data.summary,
      ...parsed.data.triggers,
      ...parsed.data.actionsTaken.map((entry) => entry.action),
    ]);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Ese contenido no se puede guardar.',
    };
  }

  try {
    const ctx = await requireTenantContext();

    await closeCrisisEvent(ctx, {
      summary: parsed.data.summary,
      severity: parsed.data.severity,
      triggers: parsed.data.triggers,
      actionsTaken: parsed.data.actionsTaken,
      outcome: parsed.data.outcome,
    });

    revalidatePath('/crisis');
    return { ok: true };
  } catch {
    return { ok: false, error: 'No pudimos guardar el episodio.' };
  }
}
