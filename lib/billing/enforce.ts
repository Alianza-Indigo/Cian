/**
 * Aplicación de los límites de plan. Fase 9.
 *
 * Une las tres piezas —qué plan tiene, qué permite ese plan y cuánto lleva
 * gastado— y devuelve el veredicto ya redactado.
 *
 * ## Qué NO se limita, nunca
 *
 * La escalera de derivación de crisis. La ruta de chat la ejecuta **antes** de
 * llegar aquí, igual que hace con el límite por minuto, y por la misma razón:
 * quien está viviendo una emergencia no puede toparse con «alcanzaste el
 * límite de tu plan». Está anotado en `app/api/chat/route.ts` y comprobado en
 * las pruebas.
 *
 * ## Degradación
 *
 * Si la consulta de consumo falla, **se deja pasar**. Igual que con el límite
 * de uso de la Fase 1: preferimos gastar de más antes que dejar sin asistente
 * a alguien que lo necesita por una caída de la base.
 */
import { checkLimit, type LimitVerdict } from './limits';
import type { LimitedResource } from './types';
import {
  getTenantPlanLimits,
  getUsageSnapshot,
} from '../db/repositories/billing';
import type { TenantContext } from '../tenant/guard';

export async function enforceLimit(
  ctx: TenantContext,
  resource: LimitedResource,
  amount = 1,
): Promise<LimitVerdict> {
  try {
    // Con la concesión de plataforma ya aplicada: si a este espacio se le
    // subió un límite a mano, es este el que manda.
    const [{ plan, limits }, usage] = await Promise.all([
      getTenantPlanLimits(ctx),
      getUsageSnapshot(ctx),
    ]);

    return checkLimit({
      resource,
      used: usage[resource],
      plan,
      limits,
      amount,
    });
  } catch {
    return { allowed: true, remaining: null };
  }
}

/** Todo lo que la pantalla de membresía necesita, en una llamada. */
export async function planOverview(ctx: TenantContext) {
  const [{ plan, limits }, usage] = await Promise.all([
    getTenantPlanLimits(ctx),
    getUsageSnapshot(ctx),
  ]);

  return { plan, limits, usage };
}
