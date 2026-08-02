/**
 * Vocabulario del módulo de alimentación.
 *
 * Leer `lib/nutrition/guardrail.ts` antes de tocar nada aquí: este módulo
 * tiene prohibido emitir cantidades, calorías, metas de peso y restricciones
 * (regla 3.6 del PRD).
 */

export const MEAL_SLOTS = [
  'desayuno',
  'colacion_manana',
  'comida',
  'colacion_tarde',
  'cena',
] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];

export const MEAL_SLOT_LABELS: Record<MealSlot, string> = {
  desayuno: 'Desayuno',
  colacion_manana: 'Colación de la mañana',
  comida: 'Comida',
  colacion_tarde: 'Colación de la tarde',
  cena: 'Cena',
};

export const WEEKDAYS = [
  'lunes',
  'martes',
  'miercoles',
  'jueves',
  'viernes',
  'sabado',
  'domingo',
] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  lunes: 'Lunes',
  martes: 'Martes',
  miercoles: 'Miércoles',
  jueves: 'Jueves',
  viernes: 'Viernes',
  sabado: 'Sábado',
  domingo: 'Domingo',
};

/** Cómo se vive una textura. Es lo que sustituye a cualquier métrica. */
export const TEXTURE_RESPONSES = ['acepta', 'depende', 'rechaza'] as const;
export type TextureResponse = (typeof TEXTURE_RESPONSES)[number];

export const TEXTURE_RESPONSE_LABELS: Record<TextureResponse, string> = {
  acepta: 'La acepta',
  depende: 'Depende del día',
  rechaza: 'La rechaza',
};

export const COMMON_TEXTURES = [
  'suave',
  'crujiente',
  'blanda',
  'fibrosa',
  'granulosa',
  'liquida',
  'pegajosa',
  'mixta',
] as const;

/** Menú de una semana: por día y por momento, solo descripciones. */
export type MealPlanContent = Partial<
  Record<Weekday, Partial<Record<MealSlot, string>>>
>;

export type FoodTextureNote = {
  texture: string;
  response: TextureResponse;
};

export type ShoppingItem = {
  /** Solo el nombre. Sin cantidades: lo impone el barandal, no el gusto. */
  name: string;
  category?: string;
};

export function isWeekday(value: unknown): value is Weekday {
  return WEEKDAYS.includes(value as Weekday);
}

export function isMealSlot(value: unknown): value is MealSlot {
  return MEAL_SLOTS.includes(value as MealSlot);
}

/** Lunes de la semana que contiene la fecha dada, en formato ISO corto. */
export function weekStartOf(date: Date): string {
  const copy = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const weekday = copy.getUTCDay(); // 0 domingo … 6 sábado
  const offset = weekday === 0 ? -6 : 1 - weekday;
  copy.setUTCDate(copy.getUTCDate() + offset);
  return copy.toISOString().slice(0, 10);
}
