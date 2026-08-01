/**
 * Saneado de texto para las fuentes estándar de PDF.
 *
 * Las fuentes base de `pdf-lib` codifican en WinAnsi. Se comprobó que cubren
 * todo el español —acentos, ñ, ¿, ¡, comillas angulares, guiones largos— pero
 * **lanzan excepción** ante cualquier carácter fuera de ese repertorio:
 *
 *   WinAnsi cannot encode "..." (0x65e5)
 *
 * El contenido de un documento lo escribe un modelo de lenguaje, que
 * perfectamente puede soltar un emoji o una flecha. Sin este saneado, un
 * carácter suelto tumba la generación entera de un documento de 15 páginas.
 *
 * La regla: sustituir lo que tenga equivalente razonable, descartar el resto.
 * Un documento al que le falta un emoji sigue sirviendo; uno que no se generó,
 * no.
 *
 * Nota de estilo: los caracteres se declaran por punto de código y las
 * expresiones regulares se construyen con `new RegExp` a partir de cadenas
 * ASCII. Varios de ellos son invisibles, y escribirlos literales deja el
 * archivo ilegible y frágil (un separador de línea llegó a romper el propio
 * literal de la expresión regular).
 */

/**
 * Puntos de código que WinAnsi coloca en 0x80–0x9F, fuera del rango Latin-1.
 * Son los que hacen que la tipografía española «bonita» funcione: comillas
 * curvas, guion largo, puntos suspensivos, viñeta.
 */
const WINANSI_EXTRA_CODE_POINTS = [
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030,
  0x0160, 0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022,
  0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
];

const WINANSI_EXTRA = new Set(
  WINANSI_EXTRA_CODE_POINTS.map((code) => String.fromCodePoint(code)),
);

/** Sustituciones con equivalente tipográfico aceptable. */
const REPLACEMENTS: Array<[RegExp, string]> = [
  // Espacio duro y espacios tipográficos de todos los anchos.
  [new RegExp('\\u00A0', 'g'), ' '],
  [new RegExp('[\\u2000-\\u200A\\u202F\\u205F\\u3000]', 'g'), ' '],
  // Invisibles, marcas de dirección, separadores de línea y BOM.
  [new RegExp('[\\u200B-\\u200F\\u2028\\u2029\\uFEFF]', 'g'), ''],
  // Guiones que no son el guion normal.
  [new RegExp('[\\u2212\\u2010\\u2011]', 'g'), '-'],
  [new RegExp('[\\u2043\\u2219]', 'g'), '-'],
  // Viñetas variadas a la viñeta estándar.
  [new RegExp('[\\u25CF\\u25AA\\u25E6\\u2023]', 'g'), '•'],
  // Flechas: se escriben, no se dibujan.
  [new RegExp('[\\u2192\\u27A1\\u21D2]', 'g'), '->'],
  [new RegExp('[\\u2190\\u21D0]', 'g'), '<-'],
  // Palomas y cruces, frecuentes en listas de verificación.
  [new RegExp('[\\u2713\\u2714]', 'g'), '[x]'],
  [new RegExp('[\\u2717\\u2718]', 'g'), '[ ]'],
  // Comillas de pulgada y minuto.
  [new RegExp('\\u2033', 'g'), '"'],
  [new RegExp('\\u2032', 'g'), "'"],
];

const COMBINING_MARKS = new RegExp('[\\u0300-\\u036F]', 'g');

export function isWinAnsiEncodable(character: string): boolean {
  const code = character.codePointAt(0);
  if (code === undefined) return false;
  if (code >= 0x20 && code <= 0x7e) return true;
  if (code >= 0xa0 && code <= 0xff) return true;
  return WINANSI_EXTRA.has(character);
}

/**
 * Devuelve un texto que las fuentes estándar pueden dibujar sin lanzar.
 * Conserva saltos de línea y tabulaciones, que se tratan aparte al maquetar.
 */
export function sanitizeForPdf(text: string): string {
  let result = text.normalize('NFC');

  for (const [pattern, replacement] of REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }

  let output = '';
  for (const character of result) {
    if (character === '\n' || character === '\t' || character === '\r') {
      output += character;
      continue;
    }

    if (isWinAnsiEncodable(character)) {
      output += character;
      continue;
    }

    // Última oportunidad: quitar diacríticos exóticos y reintentar.
    const stripped = character.normalize('NFD').replace(COMBINING_MARKS, '');

    if (stripped.length > 0 && [...stripped].every(isWinAnsiEncodable)) {
      output += stripped;
    }
    // Si tampoco, se descarta en silencio.
  }

  return output;
}

/** Informa qué caracteres se perdieron. Útil para registrar, no para la UI. */
export function findUnencodable(text: string): string[] {
  const missing = new Set<string>();

  for (const character of text.normalize('NFC')) {
    if (character === '\n' || character === '\t' || character === '\r') continue;
    if (!isWinAnsiEncodable(character)) missing.add(character);
  }

  return [...missing];
}
