/**
 * Comprobación de límites de plan. Fase 9.
 *
 * Criterio de aceptación, y es de producto más que de ingeniería:
 *
 * > Alcanzar un límite de plan produce un **mensaje claro con la opción de
 * > mejorar plan**, no un error.
 *
 * De ahí que esto no devuelva un booleano. Devuelve qué pasó, cuánto queda y
 * qué se puede hacer al respecto, en castellano y sin jerga. Quien lee este
 * mensaje no hizo nada mal: usó la herramienta.
 *
 * Módulo puro, sin base de datos ni red, para poder probar cada frontera.
 */
import {
  DEFAULT_PLAN_LIMITS,
  PLAN_LABELS,
  formatBytes,
  type LimitedResource,
  type Plan,
  type PlanLimits,
} from './types';

export type LimitVerdict =
  | { allowed: true; remaining: number | null }
  | {
      allowed: false;
      /** Para la persona. Explica qué pasó y qué puede hacer. */
      message: string;
      /** El plan al que conviene subir, si existe uno mejor. */
      upgradeTo: Plan | null;
      limit: number;
      used: number;
    };

/** El siguiente plan hacia arriba. `null` cuando ya está en el mayor. */
export function nextPlan(plan: Plan): Plan | null {
  if (plan === 'free') return 'personal';
  if (plan === 'personal') return 'organization';
  return null;
}

function describeLimit(resource: LimitedResource, limit: number): string {
  if (resource === 'almacenamiento') return formatBytes(limit);
  return String(limit);
}

/**
 * Frases por recurso.
 *
 * Se escriben aparte y completas —no armadas con plantillas genéricas— porque
 * el tono importa: «alcanzaste el límite» suena a castigo, «llegaste al máximo
 * de este plan» suena a información.
 */
function limitMessage(
  resource: LimitedResource,
  limit: number,
  plan: Plan,
  upgradeTo: Plan | null,
): string {
  const cuanto = describeLimit(resource, limit);

  const cuerpo: Record<LimitedResource, string> = {
    mensajes: `Llegaste a los ${cuanto} mensajes que incluye el plan ${PLAN_LABELS[plan]} este mes.`,
    documentos: `Llegaste a los ${cuanto} documentos que incluye el plan ${PLAN_LABELS[plan]} este mes.`,
    almacenamiento: `Tus archivos ocupan los ${cuanto} que incluye el plan ${PLAN_LABELS[plan]}.`,
    equipo_de_apoyo: `El plan ${PLAN_LABELS[plan]} incluye hasta ${cuanto} personas en tu equipo de apoyo.`,
  };

  const salida: Record<LimitedResource, string> = {
    mensajes: 'El contador se reinicia el día 1 del mes que entra.',
    documentos:
      'El contador se reinicia el día 1. Los documentos que ya generaste siguen ahí.',
    almacenamiento:
      'Puedes liberar espacio borrando adjuntos o documentos que ya no necesites.',
    equipo_de_apoyo:
      'Puedes retirar a alguien del equipo para hacer sitio; lo que le compartiste deja de verse al instante.',
  };

  const mejora = upgradeTo
    ? ` Si te hace falta más, el plan ${PLAN_LABELS[upgradeTo]} amplía este límite.`
    : '';

  return `${cuerpo[resource]} ${salida[resource]}${mejora}`;
}

/**
 * Si cabe una unidad más del recurso.
 *
 * `used` es lo consumido **antes** de esta operación. Con `amount` se pregunta
 * por algo que ocupa más de una unidad, como un archivo de varios megas.
 */
export function checkLimit(input: {
  resource: LimitedResource;
  used: number;
  plan: Plan;
  limits: PlanLimits;
  amount?: number;
}): LimitVerdict {
  const limit = input.limits[input.resource];

  // `null` es sin límite. No es lo mismo que cero.
  if (limit === null) return { allowed: true, remaining: null };

  const amount = input.amount ?? 1;

  if (input.used + amount <= limit) {
    return { allowed: true, remaining: limit - input.used - amount };
  }

  const upgradeTo = nextPlan(input.plan);

  return {
    allowed: false,
    message: limitMessage(input.resource, limit, input.plan, upgradeTo),
    upgradeTo,
    limit,
    used: input.used,
  };
}

/**
 * Mezcla los límites de la tabla con los del código.
 *
 * Lo que venga de `plan_limits` manda, pero solo campo a campo: una fila mal
 * guardada, con la mitad de las claves, no debe dejar el resto en `undefined`
 * —que en la comprobación de arriba se comportaría como «sin límite»— y abrir
 * la puerta de par en par sin que nadie se entere.
 */
export function resolveLimits(
  plan: Plan,
  overrides: Partial<PlanLimits> | null | undefined,
): PlanLimits {
  const base = DEFAULT_PLAN_LIMITS[plan];
  if (!overrides) return base;

  const pick = <K extends keyof PlanLimits>(key: K): PlanLimits[K] => {
    const value = overrides[key];
    return value === undefined ? base[key] : (value as PlanLimits[K]);
  };

  return {
    mensajes: pick('mensajes'),
    documentos: pick('documentos'),
    almacenamiento: pick('almacenamiento'),
    equipo_de_apoyo: pick('equipo_de_apoyo'),
    asientos: pick('asientos'),
  };
}

/** El primer día del mes en curso, en UTC. Es la ventana de los contadores. */
export function currentPeriodStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
