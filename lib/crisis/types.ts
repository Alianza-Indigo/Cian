/**
 * Vocabulario del módulo de crisis no emergentes.
 *
 * Sin dependencias, como el resto de módulos de tipos: lo comparten el
 * esquema, las tools, las pruebas y el navegador.
 *
 * Una aclaración de lenguaje, porque aquí las palabras importan: «crisis» en
 * CIAN quiere decir desregulación —sobrecarga, colapso, bloqueo—, no
 * emergencia médica ni psiquiátrica. Lo que sí es emergencia lo intercepta
 * `lib/crisis/escalation.ts` antes de que llegue al modelo.
 */

// --- Intensidad -------------------------------------------------------------

export const CRISIS_SEVERITIES = ['leve', 'moderada', 'intensa'] as const;
export type CrisisSeverity = (typeof CRISIS_SEVERITIES)[number];

export const CRISIS_SEVERITY_LABELS: Record<CrisisSeverity, string> = {
  leve: 'Leve',
  moderada: 'Moderada',
  intensa: 'Intensa',
};

export const CRISIS_SEVERITY_HINTS: Record<CrisisSeverity, string> = {
  leve: 'Está alterado pero todavía escucha y responde.',
  moderada: 'Ya no responde a lo de siempre; hace falta bajar demandas.',
  intensa: 'Colapso completo: llanto, gritos o bloqueo, sin comunicación posible.',
};

// --- Cómo terminó -----------------------------------------------------------

export const CRISIS_OUTCOMES = [
  'se_regulo',
  'bajo_poco_a_poco',
  'termino_agotado',
  'sigue_activa',
  'se_derivo',
] as const;
export type CrisisOutcome = (typeof CRISIS_OUTCOMES)[number];

export const CRISIS_OUTCOME_LABELS: Record<CrisisOutcome, string> = {
  se_regulo: 'Se reguló',
  'bajo_poco_a_poco': 'Bajó poco a poco',
  termino_agotado: 'Terminó por agotamiento',
  sigue_activa: 'Seguía activa al registrar',
  se_derivo: 'Se derivó a servicios de emergencia',
};

// --- Piezas guardadas en jsonb ---------------------------------------------

/** Un paso del acompañamiento. Corto a propósito: se lee en plena crisis. */
export type CrisisStep = {
  title: string;
  detail?: string | null;
};

/** Algo que se intentó, y si sirvió. `null` cuando no se sabe. */
export type CrisisAction = {
  action: string;
  helped: boolean | null;
};

// --- Límites ----------------------------------------------------------------

/**
 * Cuántos pasos puede tener una guía en modo crisis.
 *
 * Es un límite de diseño, no de almacenamiento. Quien está conteniendo una
 * crisis no puede seguir una lista de doce puntos: si no cabe en una pantalla
 * de teléfono, no sirve.
 */
export const MAX_CRISIS_STEPS = 6;

/** Cuántos episodios se leen para calcular patrones. */
export const PATTERN_WINDOW = 60;
