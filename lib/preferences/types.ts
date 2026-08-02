/**
 * Vocabulario de preferencias, sin dependencias.
 *
 * Este modulo lo comparten el esquema de base de datos, el servidor y el
 * navegador, por lo que no puede importar Drizzle ni el cliente de Postgres:
 * hacerlo mandaria el driver de base de datos al paquete del cliente.
 *
 * Los valores se guardan en ingles canonico y se traducen en la UI, para que
 * la estructura quede lista para i18n (regla 4.3).
 */

export const DENSITIES = ['compact', 'comfortable', 'spacious'] as const;
export type Density = (typeof DENSITIES)[number];

export const THEMES = ['light', 'dark', 'system'] as const;
export type ThemePreference = (typeof THEMES)[number];

export const DETAIL_LEVELS = ['brief', 'balanced', 'detailed'] as const;
export type DetailLevel = (typeof DETAIL_LEVELS)[number];

/** Limites del escalado tipografico, en porcentaje. */
export const TEXT_SCALE_MIN = 85;
export const TEXT_SCALE_MAX = 150;
export const TEXT_SCALE_DEFAULT = 100;

export const TEXT_SCALE_STEPS = [85, 100, 115, 130, 150] as const;

/**
 * Velocidad de la lectura por voz, en porcentaje. La sintesis del navegador
 * acepta de 0.5 a 2; se guarda como entero para no arrastrar decimales.
 */
export const SPEECH_RATE_MIN = 50;
export const SPEECH_RATE_MAX = 200;
export const SPEECH_RATE_DEFAULT = 100;
export const SPEECH_RATE_STEPS = [70, 85, 100, 125, 150] as const;

/** Las preferencias que gobiernan la presentacion, todas resueltas. */
export type EffectivePreferences = {
  density: Density;
  textScale: number;
  reducedMotion: boolean;
  theme: ThemePreference;
  detailLevel: DetailLevel;
  speechRate: number;
};

export type PreferencesPatch = Partial<EffectivePreferences>;

/** Valores usados mientras la persona no ha guardado preferencias propias. */
export const DEFAULT_PREFERENCES: EffectivePreferences = {
  density: 'comfortable',
  textScale: TEXT_SCALE_DEFAULT,
  reducedMotion: false,
  theme: 'system',
  detailLevel: 'balanced',
  speechRate: SPEECH_RATE_DEFAULT,
};

export function clampTextScale(value: number): number {
  if (!Number.isFinite(value)) return TEXT_SCALE_DEFAULT;
  return Math.min(TEXT_SCALE_MAX, Math.max(TEXT_SCALE_MIN, Math.round(value)));
}

export function clampSpeechRate(value: number): number {
  if (!Number.isFinite(value)) return SPEECH_RATE_DEFAULT;
  return Math.min(SPEECH_RATE_MAX, Math.max(SPEECH_RATE_MIN, Math.round(value)));
}
