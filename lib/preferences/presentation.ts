/**
 * Traduccion de las preferencias guardadas a atributos de presentacion.
 *
 * La fuente de verdad es `user_preferences` en Postgres. La cookie `cian_prefs`
 * es solo un espejo para que las pantallas sin sesion (login) y el primer
 * pintado respeten la eleccion de la persona sin parpadeo. Si el espejo y la
 * base discrepan, gana la base y el espejo se reescribe.
 */
import {
  DEFAULT_PREFERENCES,
  DENSITIES,
  DETAIL_LEVELS,
  TEXT_SCALE_DEFAULT,
  TEXT_SCALE_MAX,
  TEXT_SCALE_MIN,
  TEXT_SCALE_STEPS,
  SPEECH_RATE_DEFAULT,
  SPEECH_RATE_STEPS,
  THEMES,
  clampSpeechRate,
  clampTextScale,
  type EffectivePreferences,
} from './types';

export const PREFERENCES_COOKIE = 'cian_prefs';

export {
  DENSITIES,
  DETAIL_LEVELS,
  THEMES,
  TEXT_SCALE_STEPS,
  SPEECH_RATE_STEPS,
  SPEECH_RATE_DEFAULT,
  TEXT_SCALE_DEFAULT,
  TEXT_SCALE_MAX,
  TEXT_SCALE_MIN,
};

export const DENSITY_LABELS: Record<(typeof DENSITIES)[number], string> = {
  compact: 'Compacta',
  comfortable: 'Cómoda',
  spacious: 'Amplia',
};

export const DENSITY_HINTS: Record<(typeof DENSITIES)[number], string> = {
  compact: 'Más contenido a la vista, menos espacio entre elementos.',
  comfortable: 'Equilibrio entre cantidad de información y espacio.',
  spacious: 'Mucho aire entre elementos y objetivos táctiles más grandes.',
};

export const THEME_LABELS: Record<(typeof THEMES)[number], string> = {
  light: 'Claro',
  dark: 'Oscuro',
  system: 'Según el sistema',
};

export const DETAIL_LEVEL_LABELS: Record<(typeof DETAIL_LEVELS)[number], string> =
  {
    brief: 'Breve',
    balanced: 'Equilibrado',
    detailed: 'Detallado',
  };

export const DETAIL_LEVEL_HINTS: Record<(typeof DETAIL_LEVELS)[number], string> =
  {
    brief: 'Respuestas cortas y directas, sin rodeos.',
    balanced: 'Lo necesario para entender, sin extenderse de más.',
    detailed: 'Explicaciones amplias, con contexto y ejemplos.',
  };

/** Atributos que se cuelgan de <html> para que el CSS haga el resto. */
export type PresentationAttributes = {
  'data-theme': 'light' | 'dark';
  'data-theme-preference': (typeof THEMES)[number];
  'data-density': (typeof DENSITIES)[number];
  'data-reduced-motion': 'true' | 'false';
};

export function toPresentationAttributes(
  preferences: EffectivePreferences,
): PresentationAttributes {
  return {
    // `system` se resuelve a claro en el servidor y lo corrige el script
    // en linea antes del primer pintado.
    'data-theme': preferences.theme === 'dark' ? 'dark' : 'light',
    'data-theme-preference': preferences.theme,
    'data-density': preferences.density,
    'data-reduced-motion': preferences.reducedMotion ? 'true' : 'false',
  };
}

export function textScaleStyle(textScale: number): Record<string, string> {
  return { '--cian-text-scale': String(clampTextScale(textScale) / 100) };
}

/**
 * Script minimo que corre antes del primer pintado. Solo resuelve el tema
 * `system` con `matchMedia`; no lee ni escribe estado propio.
 */
export const THEME_BOOTSTRAP_SCRIPT = `(function(){try{var e=document.documentElement;if(e.getAttribute('data-theme-preference')!=='system')return;var d=window.matchMedia('(prefers-color-scheme: dark)').matches;e.setAttribute('data-theme',d?'dark':'light');}catch(_){}})();`;

export function serializePreferencesCookie(
  preferences: EffectivePreferences,
): string {
  return JSON.stringify({
    d: preferences.density,
    s: preferences.textScale,
    m: preferences.reducedMotion ? 1 : 0,
    t: preferences.theme,
    l: preferences.detailLevel,
    v: preferences.speechRate,
  });
}

/** Lee el espejo. Ante cualquier duda devuelve los valores por defecto. */
export function parsePreferencesCookie(
  value: string | undefined,
): EffectivePreferences {
  if (!value) return { ...DEFAULT_PREFERENCES };

  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== 'object' || parsed === null) {
      return { ...DEFAULT_PREFERENCES };
    }

    const raw = parsed as Record<string, unknown>;
    const density = DENSITIES.find((item) => item === raw.d);
    const theme = THEMES.find((item) => item === raw.t);
    const detailLevel = DETAIL_LEVELS.find((item) => item === raw.l);
    const scale = typeof raw.s === 'number' ? raw.s : TEXT_SCALE_DEFAULT;

    return {
      density: density ?? DEFAULT_PREFERENCES.density,
      theme: theme ?? DEFAULT_PREFERENCES.theme,
      detailLevel: detailLevel ?? DEFAULT_PREFERENCES.detailLevel,
      textScale: clampTextScale(scale),
      reducedMotion: raw.m === 1 || raw.m === true,
      speechRate: clampSpeechRate(
        typeof raw.v === 'number' ? raw.v : SPEECH_RATE_DEFAULT,
      ),
    };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}
