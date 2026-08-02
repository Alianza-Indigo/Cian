/**
 * Barandal médico del módulo de crisis. Regla 3.6 del PRD.
 *
 * > El prompt del agente de crisis tiene prohibido diagnosticar, sugerir
 * > medicación o dar instrucciones médicas.
 *
 * **Por qué no basta el prompt.** Un prompt es una instrucción que el modelo
 * puede desatender, sobre todo cuando la persona insiste —y en crisis se
 * insiste—. Esto es una comprobación que corre siempre, sobre el contenido que
 * el modelo produjo, antes de que se guarde o se muestre.
 *
 * **Cómo se aplica.** Las tools de crisis reciben del modelo los pasos del
 * acompañamiento, el registro del episodio, los protocolos y el plan
 * posterior. Si el contenido cruza la línea, la tool falla con un mensaje que
 * le explica qué corregir, y el modelo reescribe. No se sanea en silencio:
 * borrarle el nombre de un fármaco a una frase deja una instrucción a medias,
 * que es peor que ninguna.
 *
 * ---
 *
 * ## Las cinco líneas
 *
 * 1. **Medicación.** Ni nombres de fármacos, ni dosis, ni «dale algo para
 *    calmarlo», ni suspender un tratamiento. Ni siquiera para desaconsejarlo:
 *    si CIAN escribe «risperidona», alguien va a leerlo como una sugerencia.
 * 2. **Diagnóstico.** Afirmar que alguien tiene un cuadro clínico. Da igual
 *    cuánto encaje la descripción: quien diagnostica es un profesional que
 *    valora a la persona.
 * 3. **Interpretación de síntomas.** «Eso que describes es un síntoma de…».
 *    Es diagnóstico con otra gramática.
 * 4. **Contención física.** Sujetar, inmovilizar, impedir el movimiento. En
 *    crisis autista la contención física escala la crisis y ha matado gente.
 *    CIAN no la sugiere nunca, con ninguna palabra.
 * 5. **Desalentar atención.** «No es grave», «no hace falta ir al médico»,
 *    «espera a que se le pase». Restar importancia es una decisión clínica, y
 *    es la que más daño puede hacer si se equivoca.
 *
 * Nótese que **derivar sí se puede**: «esto lo valora quien lleva su
 * tratamiento» o «llama al 911» son respuestas correctas y ninguna regla las
 * toca.
 */

export type MedicalRule =
  | 'medicacion'
  | 'diagnostico'
  | 'interpretacion_de_sintomas'
  | 'contencion_fisica'
  | 'desalienta_atencion';

export type MedicalViolation = {
  rule: MedicalRule;
  /** El fragmento que la disparó, para poder explicarlo. */
  match: string;
};

type Rule = { rule: MedicalRule; pattern: RegExp };

/**
 * Fronteras conscientes de Unicode.
 *
 * `\b` de JavaScript solo entiende letras ASCII, así que se equivoca justo
 * donde el español pone acentos: no reconoce el inicio de «índice» ni el final
 * de «síntomas». Estas dos miradas lo resuelven.
 */
const START = String.raw`(?<!\p{L})`;
const END = String.raw`(?!\p{L})`;

/**
 * Fármacos que aparecen en conversaciones de neurodivergencia.
 *
 * La lista no pretende ser un vademécum: pretende cubrir lo que una familia
 * mexicana nombra en una consulta o en un grupo de apoyo. Se comprueba sin
 * contexto —basta nombrarlos para violar la regla— porque no existe una forma
 * segura de que CIAN escriba «clonazepam».
 */
const DRUG_NAMES = [
  'melatonina',
  'risperidona',
  'aripiprazol',
  'abilify',
  'olanzapina',
  'quetiapina',
  'seroquel',
  'haloperidol',
  'metilfenidato',
  'ritalin',
  'concerta',
  'atomoxetina',
  'strattera',
  'guanfacina',
  'clonidina',
  'lisdexanfetamina',
  'clonazepam',
  'rivotril',
  'diazepam',
  'lorazepam',
  'alprazolam',
  'tafil',
  'sertralina',
  'fluoxetina',
  'prozac',
  'escitalopram',
  'valproato',
  'carbamazepina',
  'lamotrigina',
  'levetiracetam',
  'difenhidramina',
  'benadryl',
  'paracetamol',
  'acetaminof[ée]n',
  'ibuprofeno',
  'naproxeno',
].join('|');

/** Sustantivos genéricos de medicación. */
const DRUG_NOUNS = [
  'medicamentos?',
  'medicinas?',
  'medicaci[óo]n',
  'pastillas?',
  'tabletas?',
  'c[áa]psulas?',
  'jarabes?',
  'gotas?',
  'inyecci[óo]n',
  'calmantes?',
  'sedantes?',
  'tranquilizantes?',
  'ansiol[íi]ticos?',
  'antipsic[óo]ticos?',
  'antidepresivos?',
  'somn[íi]feros?',
  'suplementos?',
].join('|');

/** Formas verbales con las que se ofrece algo a alguien. */
const GIVE_VERBS = [
  'dale',
  'darle',
  'dele',
  'denle',
  'd[áa]selo',
  'd[áa]sela',
  'admin[íi]str\\p{L}*',
  'sum[íi]nistr\\p{L}*',
  'prueba con',
  'prueben con',
  'puedes darle',
  'pueden darle',
  'podr[íi]as darle',
  'podr[íi]an darle',
  'te recomiendo darle',
  'les recomiendo darle',
  'conviene darle',
  'lo mejor es darle',
  'que tome',
  'que se tome',
  'ofr[ée]cele',
].join('|');

/** Cuadros clínicos que no le corresponde afirmar a CIAN. */
const CLINICAL_TERMS = [
  'tdah',
  'tda',
  'tea',
  'autismo',
  'asperger',
  'trastorno\\s+\\p{L}+',
  's[íi]ndrome\\s+de\\s+\\p{L}+',
  'epilepsia',
  'crisis\\s+epil[ée]pticas?',
  'bipolaridad',
  'depresi[óo]n',
  'ansiedad',
  'toc',
  'psicosis',
  'esquizofrenia',
  'dislexia',
  'discalculia',
  'dispraxia',
  'discapacidad\\s+intelectual',
  'retraso\\s+(?:global\\s+)?del\\s+desarrollo',
  'apraxia',
  'hipoton[íi]a',
].join('|');

/** Marcos con los que se afirma que alguien tiene algo. */
const DIAGNOSTIC_FRAMES = [
  'tiene',
  'padece',
  'presenta',
  'sufre de',
  'es un caso de',
  'se trata de',
  'estamos ante',
  'probablemente tenga',
  'seguramente tiene',
  'muy probablemente sea',
  'podr[íi]a tener',
  'parece tener',
  'tiene rasgos de',
  'cumple criterios de',
  'cumple con los criterios de',
  'lo que tiene es',
  'lo que describes es',
  'esto es',
  'eso es',
].join('|');

const RULES: Rule[] = [
  // --- 1. Medicación --------------------------------------------------------
  {
    rule: 'medicacion',
    pattern: new RegExp(`${START}(?:${DRUG_NAMES})${END}`, 'iu'),
  },
  {
    // «dale un calmante», «que tome media pastilla», «ofrécele unas gotas».
    rule: 'medicacion',
    pattern: new RegExp(
      `${START}(?:${GIVE_VERBS})\\s+(?:\\p{L}+\\s+){0,3}(?:${DRUG_NOUNS})${END}`,
      'iu',
    ),
  },
  {
    // Ajustes de tratamiento: subirla, bajarla, saltársela.
    rule: 'medicacion',
    pattern: new RegExp(
      START +
        String.raw`(?:sub[ei]\p{L}*|baj[ae]\p{L}*|aument\p{L}*|reduc\p{L}*|ajust\p{L}*|suspend\p{L}*|susp[ée]nd\p{L}*|quit\p{L}*|salt\p{L}*)\s+(?:la\s+|el\s+|su\s+|una\s+)?(?:dosis|toma\s+de|` +
        DRUG_NOUNS +
        `|tratamiento)${END}`,
      'iu',
    ),
  },
  {
    // Dosificación explícita.
    rule: 'medicacion',
    pattern: new RegExp(
      `${START}\\d+(?:[.,]\\d+)?\\s*(?:mg|ml|mcg|miligramos?|mililitros?|gotas?|tabletas?|pastillas?)${END}`,
      'iu',
    ),
  },
  {
    rule: 'medicacion',
    pattern: new RegExp(
      START +
        String.raw`(?:media|medio|una|dos|tres)\s+(?:pastillas?|tabletas?|c[áa]psulas?|gotas?|cucharadas?\s+de\s+jarabe)` +
        END,
      'iu',
    ),
  },
  {
    rule: 'medicacion',
    pattern: new RegExp(
      `${START}(?:te\\s+receto|le\\s+receto|receta\\s+m[ée]dica\\s+de|no\\s+le\\s+des\\s+(?:su\\s+|el\\s+|la\\s+)?(?:${DRUG_NOUNS}))${END}`,
      'iu',
    ),
  },

  // --- 2. Diagnóstico -------------------------------------------------------
  {
    rule: 'diagnostico',
    pattern: new RegExp(
      `${START}(?:${DIAGNOSTIC_FRAMES})\\s+(?:un|una|el|la|de)?\\s*(?:${CLINICAL_TERMS})${END}`,
      'iu',
    ),
  },
  {
    rule: 'diagnostico',
    pattern: new RegExp(
      START +
        String.raw`(?:(?:te|le|lo|la|los|las)\s+diagnostic\p{L}*|el\s+diagn[óo]stico\s+es|diagn[óo]stico\s+de\s+\p{L}+|cumple\s+(?:con\s+)?(?:los\s+)?criterios)` +
        END,
      'iu',
    ),
  },

  // --- 3. Interpretación de síntomas ---------------------------------------
  {
    rule: 'interpretacion_de_sintomas',
    pattern: new RegExp(
      START +
        String.raw`s[íi]ntomas?\s+(?:de|compatibles?|t[íi]picos?|cl[áa]sicos?|claros?\s+de)` +
        END,
      'iu',
    ),
  },
  {
    rule: 'interpretacion_de_sintomas',
    pattern: new RegExp(
      START +
        String.raw`(?:eso|esto|lo\s+que\s+(?:describes|cuentas|me\s+cuentas|me\s+dices))\s+(?:es|son|suena\s+a|parece|indica|significa)\s+(?:un|una|unos|unas)?\s*(?:s[íi]ntoma|cuadro|crisis\s+epil[ée]ptica|reacci[óo]n\s+(?:al[ée]rgica|adversa)|efecto\s+secundario)` +
        END,
      'iu',
    ),
  },
  {
    rule: 'interpretacion_de_sintomas',
    pattern: new RegExp(
      START +
        String.raw`(?:cuadro\s+(?:cl[íi]nico|neurol[óo]gico|psiqui[áa]trico)|efecto\s+secundario\s+(?:de|del)|signo\s+de\s+alarma|est[áa]\s+somatizando|neurol[óo]gicamente\s+\p{L}+)` +
        END,
      'iu',
    ),
  },

  // --- 4. Contención física -------------------------------------------------
  {
    rule: 'contencion_fisica',
    pattern: new RegExp(
      START +
        String.raw`(?:suj[ée]t\p{L}*|inmovil[íi]\p{L}*|amarr\p{L}*|[áa]t\p{L}*|reten\p{L}*|det[ée]n\p{L}*)\s*(?:lo|la|le|los|las)?\s*(?:con\s+fuerza|fuerte|por\s+la\s+fuerza|hasta\s+que\s+se\s+calme|de\s+brazos|de\s+las\s+manos)` +
        END,
      'iu',
    ),
  },
  {
    rule: 'contencion_fisica',
    pattern: new RegExp(
      START +
        String.raw`(?:contenci[óo]n\s+f[íi]sica|suj[ée]ta(?:lo|la|le)|inmovil[íi]za(?:lo|la)|restring\p{L}*\s+(?:sus\s+)?movimientos|no\s+(?:lo|la)\s+dejes\s+moverse|abr[áa]za(?:lo|la)\s+(?:muy\s+)?fuerte\s+(?:hasta|para\s+que\s+no))` +
        END,
      'iu',
    ),
  },

  // --- 5. Desalentar atención ----------------------------------------------
  {
    rule: 'desalienta_atencion',
    pattern: new RegExp(
      START +
        String.raw`no\s+(?:hace\s+falta|es\s+necesario|hay\s+necesidad\s+de)\s+(?:que\s+)?(?:ir|acudir|llamar|llevar|consultar|preocupar\p{L}*)` +
        END,
      'iu',
    ),
  },
  {
    rule: 'desalienta_atencion',
    pattern: new RegExp(
      START +
        String.raw`no\s+(?:lo|la|le)?\s*(?:lleves|lleven|llames|llamen|acudas|vayas)\s+(?:al?\s+)?(?:m[ée]dic\p{L}*|hospital|doctor\p{L}*|urgencias|emergencias|911|ambulancia|pediatra)` +
        END,
      'iu',
    ),
  },
  {
    rule: 'desalienta_atencion',
    pattern: new RegExp(
      START +
        String.raw`(?:no\s+es\s+(?:nada\s+)?grave|no\s+es\s+nada\s+serio|seguro\s+(?:no\s+es\s+nada|se\s+le\s+pasa)|se\s+le\s+va\s+a\s+pasar\s+sol\p{L}*|espera\s+a\s+que\s+se\s+le\s+pase\s+antes\s+de|puedes\s+esperar\s+antes\s+de\s+(?:llamar|ir|consultar))` +
        END,
      'iu',
    ),
  },
];

/** Todas las violaciones encontradas en un texto. */
export function findMedicalViolations(text: string): MedicalViolation[] {
  const normalized = text.normalize('NFC');
  const found: MedicalViolation[] = [];

  for (const { rule, pattern } of RULES) {
    const match = pattern.exec(normalized);
    if (match) found.push({ rule, match: match[0] });
  }

  return found;
}

export function isSafeCrisisText(text: string): boolean {
  return findMedicalViolations(text).length === 0;
}

const RULE_GUIDANCE: Record<MedicalRule, string> = {
  medicacion:
    'no menciones medicamentos, dosis, ni sugieras dar, quitar o ajustar ' +
    'nada de un tratamiento: eso lo decide quien lo receta',
  diagnostico:
    'no afirmes que alguien tiene un cuadro clínico ni uses etiquetas ' +
    'diagnósticas: describe lo que está pasando sin nombrarlo como condición',
  interpretacion_de_sintomas:
    'no interpretes lo que se te describe como síntoma, cuadro ni efecto de ' +
    'nada: acompaña la situación concreta y deriva si hace falta',
  contencion_fisica:
    'no sugieras sujetar, inmovilizar ni impedir el movimiento de nadie: ' +
    'en crisis eso escala la crisis y es peligroso',
  desalienta_atencion:
    'no restes importancia ni desalientes buscar atención: no te toca ' +
    'decidir si algo es grave',
};

/**
 * Mensaje para el modelo cuando su contenido cruzó la línea.
 *
 * Va dirigido al modelo, no a la persona: explica qué corregir y por qué, para
 * que el reintento salga bien en vez de repetir el mismo error.
 */
export function explainMedicalViolations(violations: MedicalViolation[]): string {
  const guidance = [...new Set(violations.map((violation) => RULE_GUIDANCE[violation.rule]))];

  return (
    'Este contenido no puede entregarse en el módulo de crisis de CIAN. ' +
    `Corrige lo siguiente y vuelve a intentarlo: ${guidance.join('; ')}. ` +
    'CIAN acompaña la desregulación con estrategias de entorno, demandas y ' +
    'comunicación; lo médico se deriva, no se resuelve aquí.'
  );
}

/**
 * Comprueba un conjunto de textos y lanza si alguno cruza la línea.
 * Lo usan las tools de crisis sobre el contenido que escribió el modelo.
 */
export function assertSafeCrisisContent(
  texts: Array<string | null | undefined>,
): void {
  const joined = texts.filter((text): text is string => Boolean(text)).join('\n');
  if (joined.length === 0) return;

  const violations = findMedicalViolations(joined);
  if (violations.length > 0) {
    throw new Error(explainMedicalViolations(violations));
  }
}
