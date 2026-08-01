import { cookies } from 'next/headers';
import { getTenantContext } from '../tenant/context';
import { getEffectivePreferences } from '../db/repositories/preferences';
import {
  DEFAULT_PREFERENCES,
  type EffectivePreferences,
} from './types';
import { PREFERENCES_COOKIE, parsePreferencesCookie } from './presentation';

/**
 * Preferencias con las que se pinta la aplicacion.
 *
 * Orden: base de datos (verdad) → espejo en cookie (pantallas sin sesion o
 * base momentaneamente inalcanzable) → valores por defecto. Que la interfaz
 * pierda el tema elegido no debe impedir que alguien entre a la aplicacion.
 */
export async function loadPresentationPreferences(): Promise<EffectivePreferences> {
  try {
    const ctx = await getTenantContext();
    if (ctx) {
      return await getEffectivePreferences(ctx);
    }
  } catch {
    // Sin sesion utilizable o base inalcanzable: se cae al espejo.
  }

  try {
    const cookieStore = await cookies();
    return parsePreferencesCookie(cookieStore.get(PREFERENCES_COOKIE)?.value);
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}
