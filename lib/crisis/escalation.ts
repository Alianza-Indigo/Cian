/**
 * Escalera de derivación. Regla 3.6 del PRD.
 *
 * > Debe existir una escalera de derivación que se dispare ante señales de
 * > emergencia real (riesgo de vida, lesión, ideación) y devuelva una
 * > respuesta fija y breve dirigiendo a servicios de emergencia, sin continuar
 * > el flujo de apoyo.
 *
 * **Esto corre antes que el modelo y no depende de él.** Es una comprobación
 * determinista sobre el mensaje de la persona: si se dispara, CIAN devuelve un
 * texto fijo y **no llama al modelo**. Un barandal que dependiera de que el
 * modelo se porte bien no sería un barandal.
 *
 * ---
 *
 * ## Por qué la precisión importa tanto como la sensibilidad
 *
 * La tentación es hacer el detector agresivo: ante la duda, escalar. Aquí eso
 * está mal, y el PRD lo dice explícitamente al pedir que **no** se dispare con
 * «estoy agotada».
 *
 * Quien escribe a CIAN suele ser una madre o un cuidador exhausto. Si al decir
 * «ya no aguanto» recibe un aviso de emergencia en vez del acompañamiento que
 * venía a buscar, pasan dos cosas: se queda sin ayuda, y aprende que decir la
 * verdad sobre su cansancio tiene consecuencias. La siguiente vez no lo dirá.
 *
 * Por eso el detector busca señales explícitas y descarta los modismos del
 * español, que son muchos: «me muero de sueño», «esto me está matando»,
 * «me quiero morir de vergüenza».
 *
 * ## Números verificados
 *
 * - **911** — emergencias nacionales en México.
 * - **800 911 2000** — Línea de la Vida (CONASAMA), salud mental y conducta
 *   suicida, gratuita, 24 horas los 365 días.
 *
 * Comprobados en fuentes oficiales el 2026-08-02. Si cambian, cambian aquí.
 */

export const EMERGENCY_NUMBER = '911';
export const MENTAL_HEALTH_LINE = '800 911 2000';

export type EscalationCategory =
  | 'ideacion_o_autolesion'
  | 'riesgo_a_otra_persona'
  | 'emergencia_medica';

export type EscalationSignal = {
  category: EscalationCategory;
  match: string;
};

type Rule = { category: EscalationCategory; pattern: RegExp };

/** Fronteras conscientes de Unicode: `\b` no sirve con letras acentuadas. */
const START = String.raw`(?<!\p{L})`;
const END = String.raw`(?!\p{L})`;

/**
 * Continuaciones que convierten una frase en modismo.
 *
 * «Me quiero morir» es una señal. «Me quiero morir de vergüenza» es una queja
 * cotidiana. La diferencia está en lo que viene después.
 */
const IDIOM_TAIL = String.raw`(?!\s+de\s+(?:verg[üu]enza|sue[ñn]o|hambre|risa|fr[íi]o|calor|pena|amor|ganas|aburrimiento|cansancio|sed|nervios|antojo|celos|envidia|curiosidad|emoci[óo]n))`;

const RULES: Rule[] = [
  // --- Ideación suicida y autolesión ---------------------------------------
  {
    category: 'ideacion_o_autolesion',
    pattern: new RegExp(
      START +
        String.raw`(?:me\s+quiero\s+morir|quiero\s+morirme|me\s+quiero\s+matar|quiero\s+matarme)` +
        IDIOM_TAIL,
      'iu',
    ),
  },
  {
    category: 'ideacion_o_autolesion',
    pattern: new RegExp(
      START +
        String.raw`(?:suicid\p{L}*|quitarme\s+la\s+vida|acabar\s+con\s+mi\s+vida|terminar\s+con\s+mi\s+vida|quitarse\s+la\s+vida)` +
        END,
      'iu',
    ),
  },
  {
    category: 'ideacion_o_autolesion',
    pattern: new RegExp(
      START +
        String.raw`(?:ya\s+no\s+quiero\s+vivir|no\s+quiero\s+seguir\s+viviendo|no\s+vale\s+la\s+pena\s+vivir|estar[íi]an\s+mejor\s+sin\s+m[íi]|todos\s+estar[íi]an\s+mejor\s+sin\s+m[íi])` +
        END,
      'iu',
    ),
  },
  {
    /*
     * Autolesión. «Me corto» a secas queda fuera a propósito: cortarse el
     * dedo picando cebolla o cortarse el pelo son frases idénticas para una
     * expresión regular, y escalar por ellas es exactamente el error que la
     * regla de arriba explica. Se exige la parte del cuerpo, el tiempo verbal
     * continuo o la palabra directa.
     */
    category: 'ideacion_o_autolesion',
    pattern: new RegExp(
      START +
        String.raw`(?:hacerme\s+da[ñn]o|hacerme\s+cortes|lastimarme|autolesion\p{L}*|cortarme\s+(?:las\s+venas|los\s+brazos|las\s+mu[ñn]ecas)|me\s+(?:estoy|estuve|estaba|he\s+estado)\s+cortando|me\s+corto\s+(?:los\s+brazos|las\s+piernas|cuando)|me\s+quemo\s+a\s+prop[óo]sito)` +
        END,
      'iu',
    ),
  },

  // --- Riesgo hacia otra persona --------------------------------------------
  {
    category: 'riesgo_a_otra_persona',
    pattern: new RegExp(
      START +
        String.raw`(?:le\s+voy\s+a\s+hacer\s+da[ñn]o|voy\s+a\s+lastimar\p{L}*|quiero\s+lastimar\p{L}*|voy\s+a\s+matar\p{L}*|tengo\s+miedo\s+de\s+lastimar\p{L}*)` +
        END,
      'iu',
    ),
  },
  {
    // Autolesión activa de la persona acompañada. En crisis autista el
    // golpearse la cabeza es un riesgo de lesión real, no una descripción.
    category: 'riesgo_a_otra_persona',
    pattern: new RegExp(
      START +
        String.raw`(?:se\s+est[áa]\s+(?:lastimando|golpeando|haciendo\s+da[ñn]o)|se\s+golpea\s+la\s+cabeza\s+(?:muy\s+)?fuerte|se\s+est[áa]\s+mordiendo\s+hasta\s+sangrar)` +
        END,
      'iu',
    ),
  },

  // --- Emergencia médica -----------------------------------------------------
  {
    category: 'emergencia_medica',
    pattern: new RegExp(
      START +
        String.raw`(?:no\s+respira|dej[óo]\s+de\s+respirar|no\s+puede\s+respirar|se\s+est[áa]\s+ahogando)` +
        END,
      'iu',
    ),
  },
  {
    category: 'emergencia_medica',
    pattern: new RegExp(
      START + String.raw`(?:convulsion\p{L}*|est[áa]\s+convulsionando|crisis\s+convulsiva)` + END,
      'iu',
    ),
  },
  {
    category: 'emergencia_medica',
    pattern: new RegExp(
      START +
        String.raw`(?:no\s+reacciona|no\s+responde\s+a\s+nada|est[áa]\s+inconsciente|se\s+desmay[óo]|perdi[óo]\s+el\s+conocimiento)` +
        END,
      'iu',
    ),
  },
  {
    category: 'emergencia_medica',
    pattern: new RegExp(
      START +
        String.raw`(?:se\s+intoxic[óo]|se\s+tom[óo]\s+(?:las\s+)?pastillas|tom[óo]\s+much[ao]s\s+pastillas|se\s+envenen[óo]|bebi[óo]\s+cloro)` +
        END,
      'iu',
    ),
  },
  {
    category: 'emergencia_medica',
    pattern: new RegExp(
      START +
        String.raw`(?:sangra\s+mucho|est[áa]\s+sangrando\s+mucho|hemorragia|no\s+para\s+de\s+sangrar)` +
        END,
      'iu',
    ),
  },
  {
    category: 'emergencia_medica',
    pattern: new RegExp(
      START +
        String.raw`(?:se\s+golpe[óo]\s+la\s+cabeza\s+(?:muy\s+)?fuerte|se\s+quem[óo]\s+(?:grave|mucho)|se\s+cay[óo]\s+de\s+(?:un|la|el)\b[^.]{0,30}(?:altura|escalera|ventana|techo))`,
      'iu',
    ),
  },
];

/**
 * Frases que **nunca** deben escalar por sí solas.
 *
 * No se usan para suprimir —eso lo hacen las miradas negativas de cada regla—
 * sino como documentación viva: la prueba comprueba que ninguna de estas
 * dispara la escalera.
 */
export const KNOWN_FALSE_POSITIVES = [
  'estoy agotada',
  'estoy agotado',
  'ya no aguanto',
  'no aguanto más',
  'no puedo más',
  'me muero de sueño',
  'me muero de cansancio',
  'esto me está matando',
  'me quiero morir de vergüenza',
  'estoy muerta de cansancio',
  'me estoy volviendo loca',
  'llegó muy alterado de la escuela',
  'tuvo una crisis en el supermercado',
  'se puso a llorar y no paraba',
  'me siento sobrepasada',
  'ya no sé qué hacer',
  'estoy al límite',
  'me tiene harta el ruido',
  'me corté el dedo picando cebolla',
  'me corté el pelo yo sola',
  'se cayó de la cama y solo se raspó',
];

/** Señales encontradas en un texto. Vacío significa que no hay que escalar. */
export function detectEmergencySignals(text: string): EscalationSignal[] {
  const normalized = text.normalize('NFC');
  const found: EscalationSignal[] = [];

  for (const { category, pattern } of RULES) {
    const match = pattern.exec(normalized);
    if (match) found.push({ category, match: match[0] });
  }

  return found;
}

export function shouldEscalate(text: string): boolean {
  return detectEmergencySignals(text).length > 0;
}

/**
 * Respuesta fija ante una emergencia.
 *
 * Es texto fijo a propósito: no lo escribe el modelo, no varía y no ofrece
 * alternativas. El PRD pide que el flujo **se detenga** aquí. Ofrecer opciones
 * en este punto sería invitar a seguir conversando en vez de llamar.
 *
 * El tono es corto y directo, sin alarma añadida: quien lee esto ya está
 * asustado.
 */
export function escalationResponse(signals: EscalationSignal[]): string {
  const hasIdeation = signals.some(
    (signal) => signal.category === 'ideacion_o_autolesion',
  );

  const lines = [
    'Esto necesita ayuda de personas que puedan actuar ahora mismo. CIAN no puede acompañarte en esto.',
    '',
    `**Llama al ${EMERGENCY_NUMBER}** si hay riesgo inmediato.`,
  ];

  if (hasIdeation) {
    lines.push(
      '',
      `**Línea de la Vida: ${MENTAL_HEALTH_LINE}**. Es gratuita, atiende las 24 horas los 365 días del año, y del otro lado hay una persona profesional de salud mental.`,
      '',
      'Si puedes, no te quedes en soledad mientras llamas.',
    );
  } else {
    lines.push('', 'Si puedes, que alguien más te acompañe mientras llega la ayuda.');
  }

  lines.push(
    '',
    'Cuando esto pase, aquí seguimos.',
  );

  return lines.join('\n');
}

/** Texto de una señal para registrar, sin guardar el mensaje de la persona. */
export function signalSummary(signals: EscalationSignal[]): string[] {
  return [...new Set(signals.map((signal) => signal.category))];
}
