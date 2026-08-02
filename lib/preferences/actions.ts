'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireTenantContext } from '../tenant/context';
import {
  getEffectivePreferences,
  upsertPreferences,
  type EffectivePreferences,
} from '../db/repositories/preferences';
import { recordAudit } from '../db/repositories/audit';
import {
  DENSITIES,
  DETAIL_LEVELS,
  PREFERENCES_COOKIE,
  THEMES,
  TEXT_SCALE_MAX,
  TEXT_SCALE_MIN,
  serializePreferencesCookie,
} from './presentation';
import { SPEECH_RATE_MAX, SPEECH_RATE_MIN } from './types';

const preferencesSchema = z.object({
  density: z.enum(DENSITIES).optional(),
  textScale: z.number().int().min(TEXT_SCALE_MIN).max(TEXT_SCALE_MAX).optional(),
  reducedMotion: z.boolean().optional(),
  theme: z.enum(THEMES).optional(),
  detailLevel: z.enum(DETAIL_LEVELS).optional(),
  speechRate: z
    .number()
    .int()
    .min(SPEECH_RATE_MIN)
    .max(SPEECH_RATE_MAX)
    .optional(),
});

export type SavePreferencesInput = z.infer<typeof preferencesSchema>;

export type SavePreferencesResult =
  | { ok: true; preferences: EffectivePreferences }
  | { ok: false; error: string };

/**
 * Guarda las preferencias en Postgres (verdad) y refresca el espejo en cookie.
 * El espejo se escribe DESPUES de la base: si la base falla, el espejo no
 * miente sobre lo que quedo guardado.
 */
export async function savePreferences(
  input: SavePreferencesInput,
): Promise<SavePreferencesResult> {
  const parsed = preferencesSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      error: 'Alguna de las opciones no es válida. Vuelve a intentarlo.',
    };
  }

  try {
    const ctx = await requireTenantContext();
    const row = await upsertPreferences(ctx, parsed.data);
    const preferences = await getEffectivePreferences(ctx);

    const cookieStore = await cookies();
    cookieStore.set(PREFERENCES_COOKIE, serializePreferencesCookie(preferences), {
      httpOnly: false, // es solo presentacion; no lleva datos personales
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    });

    await recordAudit(ctx, {
      action: 'preferences.updated',
      entity: 'user_preferences',
      entityId: row.id,
      metadata: {
        density: preferences.density,
        theme: preferences.theme,
        textScale: preferences.textScale,
        reducedMotion: preferences.reducedMotion,
        detailLevel: preferences.detailLevel,
        speechRate: preferences.speechRate,
      },
    });

    revalidatePath('/', 'layout');

    return { ok: true, preferences };
  } catch {
    return {
      ok: false,
      error: 'No se pudieron guardar tus preferencias. Vuelve a intentarlo.',
    };
  }
}
