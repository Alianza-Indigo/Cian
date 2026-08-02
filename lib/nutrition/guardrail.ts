/**
 * Barandal del módulo de alimentación. Regla 3.6 del PRD.
 *
 * > Prohibido emitir cantidades, calorías, metas de peso, planes numéricos o
 * > restricciones. Solo estrategias de entorno, secuencias respetuosas,
 * > preferencias y organización de menús.
 *
 * **Por qué existe este archivo y no basta el prompt.** La selectividad
 * alimentaria colinda con los trastornos de la conducta alimentaria. Un prompt
 * es una instrucción que el modelo puede desatender; esto es una comprobación
 * que se ejecuta siempre, sobre el contenido que el modelo produjo, antes de
 * que llegue a nadie.
 *
 * **Cómo se aplica.** Las tools de alimentación reciben del modelo el texto
 * del menú y de la lista de compras. Si el contenido cruza la línea, la tool
 * falla con un mensaje que le explica qué corregir, y el modelo reescribe. No
 * se sanea en silencio: un menú al que se le borran las cifras puede quedar
 * incoherente, y es mejor que se vuelva a escribir entero.
 */

export type GuardrailViolation = {
  /** Qué regla se cruzó, en términos del PRD. */
  rule:
    | 'calorias'
    | 'cantidades'
    | 'meta_de_peso'
    | 'restriccion'
    | 'lenguaje_de_dieta';
  /** El fragmento que la disparó, para poder explicarlo. */
  match: string;
};

type Rule = {
  rule: GuardrailViolation['rule'];
  pattern: RegExp;
};

/**
 * Fronteras de palabra conscientes de Unicode.
 *
 * `\b` de JavaScript solo entiende letras ASCII, así que no reconoce el inicio
 * de «índice» ni el final de «porción». Con acentos —es decir, en español— se
 * comporta mal justo donde importa. Estas dos miradas lo resuelven.
 */
const START = String.raw`(?<!\p{L})`;
const END = String.raw`(?!\p{L})`;

/**
 * Unidades de medida habituales en contextos alimentarios.
 * Se buscan precedidas de un número: «200 g», «2 tazas», «1/2 pieza».
 */
const UNIT_WORDS = [
  'g',
  'gr',
  'gramos?',
  'kg',
  'kilos?',
  'kilogramos?',
  'mg',
  'ml',
  'mililitros?',
  'l',
  'litros?',
  'oz',
  'onzas?',
  'lb',
  'libras?',
  'tazas?',
  'cucharadas?',
  'cucharaditas?',
  // Con y sin acento: «porción» y «porciones» son igual de frecuentes.
  'porci[oó]n(?:es)?',
  'raci[oó]n(?:es)?',
  'piezas?',
  'rebanadas?',
  'vasos?',
  'platos?',
].join('|');

const NUMBER = String.raw`\d+(?:[.,]\d+)?(?:\s*/\s*\d+)?`;

const RULES: Rule[] = [
  // Calorías y macronutrientes contados.
  {
    rule: 'calorias',
    pattern: new RegExp(
      START +
        String.raw`(?:calor[ií]as?|kcal|kilocalor[ií]as?|macros?|macronutrientes?|carbohidratos? totales|prote[ií]na (?:diaria|total)|d[ée]ficit cal[oó]rico|super[aá]vit cal[oó]rico)` +
        END,
      'iu',
    ),
  },
  // Cantidades: un número seguido de una unidad.
  {
    rule: 'cantidades',
    pattern: new RegExp(
      String.raw`${START}${NUMBER}\s*(?:${UNIT_WORDS})${END}`,
      'iu',
    ),
  },
  // Metas de peso.
  {
    rule: 'meta_de_peso',
    pattern: new RegExp(
      START +
        String.raw`(?:bajar de peso|subir de peso|perder peso|ganar peso|adelgazar|engordar|peso ideal|peso objetivo|[ií]ndice de masa corporal|imc|talla ideal|aumentar las porci[oó]n(?:es)?)` +
        END,
      'iu',
    ),
  },
  // Restricciones y prohibiciones alimentarias.
  {
    rule: 'restriccion',
    pattern: new RegExp(
      START +
        String.raw`(?:no debe(?:s|n)? (?:comer|consumir|tomar)|evita(?:r)? (?:por completo|totalmente)|prohibido (?:comer|consumir)|alimentos? prohibidos?|elimina(?:r)? (?:de la dieta|del men[úu])|no puede(?:s|n)? (?:comer|consumir))` +
        END,
      'iu',
    ),
  },
  // Lenguaje de dieta y de control.
  {
    rule: 'lenguaje_de_dieta',
    pattern: new RegExp(
      START +
        String.raw`(?:dieta (?:hipocal[oó]rica|baja en|estricta)|plan (?:alimenticio )?(?:hipocal[oó]rico|de adelgazamiento)|contar calor[ií]as|pesar (?:los )?alimentos|comida (?:chatarra|basura)|alimentos? (?:buenos?|malos?))` +
        END,
      'iu',
    ),
  },
];

/** Todas las violaciones encontradas en un texto. */
export function findViolations(text: string): GuardrailViolation[] {
  const found: GuardrailViolation[] = [];

  for (const { rule, pattern } of RULES) {
    const match = pattern.exec(text);
    if (match) found.push({ rule, match: match[0] });
  }

  return found;
}

export function isSafeNutritionText(text: string): boolean {
  return findViolations(text).length === 0;
}

const RULE_GUIDANCE: Record<GuardrailViolation['rule'], string> = {
  calorias:
    'no menciones calorías, kilocalorías ni macronutrientes de ninguna forma',
  cantidades:
    'no indiques cantidades ni medidas (gramos, tazas, porciones, piezas): describe los alimentos sin números',
  meta_de_peso:
    'no hables de peso corporal, de subir o bajar de peso, ni de tallas',
  restriccion:
    'no prohíbas ni elimines alimentos: CIAN organiza y acompaña, no restringe',
  lenguaje_de_dieta:
    'no uses lenguaje de dieta ni clasifiques alimentos como buenos o malos',
};

/**
 * Mensaje para el modelo cuando su contenido cruzó la línea.
 *
 * Va dirigido al modelo, no a la persona: explica qué corregir y por qué, para
 * que el reintento salga bien en vez de repetir el mismo error.
 */
export function explainViolations(violations: GuardrailViolation[]): string {
  const guidance = [...new Set(violations.map((v) => RULE_GUIDANCE[v.rule]))];

  return (
    'Este contenido no puede entregarse en el módulo de alimentación de CIAN. ' +
    `Corrige lo siguiente y vuelve a intentarlo: ${guidance.join('; ')}. ` +
    'La selectividad alimentaria colinda con los trastornos de la conducta ' +
    'alimentaria: CIAN solo ofrece estrategias de entorno, secuencias ' +
    'respetuosas, preferencias y organización de menús.'
  );
}

/**
 * Comprueba un conjunto de textos y lanza si alguno cruza la línea.
 * Lo usan las tools de alimentación sobre el contenido que escribió el modelo.
 */
export function assertSafeNutritionContent(texts: Array<string | null | undefined>): void {
  const joined = texts.filter((text): text is string => Boolean(text)).join('\n');
  if (joined.length === 0) return;

  const violations = findViolations(joined);
  if (violations.length > 0) {
    throw new Error(explainViolations(violations));
  }
}
