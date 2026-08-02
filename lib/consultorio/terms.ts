/**
 * Términos del prestador de servicios profesionales. Fase 10.
 *
 * El PRD lo pide con estas palabras, y la última frase es la que importa:
 *
 * > CIAN proporciona la **infraestructura tecnológica**. Los servicios
 * > profesionales son responsabilidad de quienes los prestan. Esto debe quedar
 * > **implementado, no solo escrito**.
 *
 * «Implementado» aquí significa tres cosas concretas, y las tres existen:
 *
 * 1. El texto vive en código versionado, con un número de versión, y se guarda
 *    **cuál** aceptó cada profesional. Cuando cambien los términos se sabrá
 *    quién aceptó qué.
 * 2. Sin `terms_accepted_at` no hay perfil profesional: no es una casilla que
 *    se pueda saltar, es una condición del alta.
 * 3. Sin términos aceptados **no se puede verificar a nadie**, ni siquiera
 *    siendo administrador del espacio. La comprobación está en el repositorio.
 *
 * El texto es deliberadamente corto y en segunda persona. Unos términos que
 * nadie lee no informan a nadie, y esto tiene que informar.
 */

/**
 * Versión de los términos.
 *
 * Se sube cuando el texto cambie de forma que afecte a lo aceptado. Los
 * perfiles guardan la versión que firmaron, así que después se puede pedir una
 * aceptación nueva solo a quien haga falta.
 */
export const TERMS_VERSION = '2026-08-1';

export const PROFESSIONAL_TERMS_TITLE =
  'Términos para profesionales que atienden en CIAN';

export const PROFESSIONAL_TERMS: readonly string[] = [
  'CIAN es la herramienta con la que atiendes: la videollamada, la agenda, las notas y los documentos. La atención profesional la prestas tú.',
  'La responsabilidad profesional, clínica, ética y legal de lo que hagas en una sesión es **tuya**, no de CIAN ni de Alianza Índigo Neurodivergente A.C.',
  'Declaras que tienes la formación y, donde la ley lo exija, la cédula profesional para ejercer las especialidades que registres. Nos autorizas a comprobarlo.',
  'Mantienes el secreto profesional. Las notas privadas que escribas no son visibles para la persona atendida, pero eso no las convierte en un espacio sin responsabilidad: siguen siendo parte de un expediente.',
  'No grabas ninguna sesión sin el consentimiento expreso de la persona atendida, registrado en la plataforma. CIAN lo impide técnicamente, y aun así es tu obligación.',
  'CIAN no es un servicio de urgencias. Si en una sesión aparece riesgo de vida, lesión grave o crisis médica, deriva a servicios de emergencia.',
  'Si tu verificación se suspende, dejas de recibir citas nuevas de inmediato. Las citas ya confirmadas siguen siendo tu responsabilidad.',
  'Puedes darte de baja cuando quieras. Las personas que atendiste conservan su historial y lo que compartiste con ellas.',
];

/** Lo que la persona atendida ve antes de su primera cita. */
export const CLIENT_NOTICE: readonly string[] = [
  'Quien te atiende es un profesional independiente, no personal de CIAN. Su formación y su cédula se verifican antes de que pueda recibir citas.',
  'CIAN pone la herramienta; la atención y su responsabilidad son de quien la presta.',
  'Nadie puede grabar la sesión sin que tú lo autorices, y puedes retirar esa autorización en cualquier momento.',
  'Las notas privadas del profesional no las ves, igual que en cualquier consulta. Lo que quiera compartir contigo aparecerá en tu historial.',
];
