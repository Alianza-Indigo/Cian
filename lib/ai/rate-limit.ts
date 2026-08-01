/**
 * Límite de uso por persona.
 *
 * Ventana fija por minuto y por hora. Es deliberadamente sencillo: el objetivo
 * es contener abuso y errores en bucle, no cobrar por uso (eso llega con los
 * planes de la Fase 9).
 *
 * Si KV no está disponible **se deja pasar**. Preferimos gastar de más antes
 * que dejar sin asistente a alguien que lo necesita por una caída de la caché.
 */
import { kvIncrementWithTtl } from '../kv';

export type RateLimitRule = {
  name: string;
  limit: number;
  windowSeconds: number;
};

export const CHAT_RATE_LIMITS: RateLimitRule[] = [
  { name: 'min', limit: 12, windowSeconds: 60 },
  { name: 'hora', limit: 180, windowSeconds: 60 * 60 },
];

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number; message: string };

function windowBucket(windowSeconds: number, now: number): number {
  return Math.floor(now / 1000 / windowSeconds);
}

/**
 * El mensaje va en segunda persona y sin jerga: quien lo lee está a media
 * conversación, a veces en un momento difícil.
 */
function buildMessage(rule: RateLimitRule): string {
  if (rule.windowSeconds <= 60) {
    return 'Estás enviando mensajes muy seguido. Espera un momento y vuelve a intentarlo.';
  }
  return 'Alcanzaste el límite de mensajes por hora. Vuelve a intentarlo más tarde.';
}

export async function checkChatRateLimit(
  tenantId: string,
  userId: string,
  rules: RateLimitRule[] = CHAT_RATE_LIMITS,
): Promise<RateLimitResult> {
  const now = Date.now();

  for (const rule of rules) {
    const bucket = windowBucket(rule.windowSeconds, now);
    const key = `ratelimit:chat:${tenantId}:${userId}:${rule.name}:${bucket}`;

    const count = await kvIncrementWithTtl(key, rule.windowSeconds);

    // `null` significa que KV no respondió: se deja pasar a propósito.
    if (count === null) continue;

    if (count > rule.limit) {
      const elapsed = (now / 1000) % rule.windowSeconds;
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil(rule.windowSeconds - elapsed)),
        message: buildMessage(rule),
      };
    }
  }

  return { allowed: true };
}
