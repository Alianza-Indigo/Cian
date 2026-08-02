/**
 * El enlace de la videollamada. Fase 10.
 *
 * ## Por qué Google Meet y no un servidor de medios propio
 *
 * La videollamada la pone Google Meet. CIAN no transporta audio ni vídeo: pone
 * la agenda, el control de acceso al enlace, las notas, las tareas, la pizarra
 * y el consentimiento.
 *
 * Es coherente con lo que el PRD dice del módulo entero —CIAN proporciona la
 * infraestructura, no el servicio— y evita la única dependencia de todo el
 * proyecto que no se podía escribir a mano.
 *
 * ## Lo que sí se puede controlar, y lo que no
 *
 * **Sí:** quién ve el enlace y cuándo. El enlace no viaja en el HTML de la
 * página; se pide a una ruta que comprueba participación, estado de la cita y
 * ventana horaria antes de devolverlo. Alguien que no sea parte de la consulta
 * no lo obtiene por ninguna vía.
 *
 * **No:** lo que pase dentro de Meet. La grabación, en particular, la controla
 * Google y no CIAN. Eso cambia el alcance de un criterio del PRD y está dicho
 * con todas sus letras en NOTES.md y en la propia pantalla de sesión: el
 * consentimiento que se registra aquí es un acuerdo documentado con sello de
 * tiempo, no un impedimento técnico.
 *
 * ## La validación del enlace no es cosmética
 *
 * Un campo de URL libre que después se pinta como enlace, dentro de una
 * plataforma de salud, es una vía de phishing: bastaría con que alguien con
 * perfil profesional pusiera una dirección que imita a Meet. Por eso solo se
 * admiten enlaces cuyo host esté en la lista de abajo.
 */

export const MEETING_PROVIDERS = ['meet'] as const;
export type MeetingProvider = (typeof MEETING_PROVIDERS)[number];

export const MEETING_PROVIDER_LABELS: Record<MeetingProvider, string> = {
  meet: 'Google Meet',
};

/**
 * Hosts admitidos.
 *
 * Añadir Zoom u otro proveedor es agregar su host aquí y su etiqueta arriba;
 * el resto del módulo no cambia.
 */
const ALLOWED_HOSTS: Record<MeetingProvider, readonly string[]> = {
  meet: ['meet.google.com'],
};

export type MeetingLink = {
  provider: MeetingProvider;
  url: string;
};

export type LinkVerdict =
  | { valid: true; link: MeetingLink }
  | { valid: false; reason: string };

/**
 * Comprueba y normaliza un enlace de reunión.
 *
 * Exige `https`, host exacto de la lista y nada de credenciales embebidas en
 * la URL. Se comparan hosts completos y no sufijos: `meet.google.com.algo.mx`
 * no es Google, y comprobar con `endsWith` lo dejaría pasar.
 */
export function parseMeetingLink(raw: string): LinkVerdict {
  const trimmed = raw.trim();

  if (trimmed.length === 0) {
    return { valid: false, reason: 'Falta el enlace de la videollamada.' };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { valid: false, reason: 'Ese enlace no se entiende.' };
  }

  if (url.protocol !== 'https:') {
    return { valid: false, reason: 'El enlace tiene que empezar por https.' };
  }

  if (url.username || url.password) {
    return { valid: false, reason: 'El enlace no puede llevar usuario ni contraseña.' };
  }

  const host = url.hostname.toLowerCase();

  for (const provider of MEETING_PROVIDERS) {
    if (ALLOWED_HOSTS[provider].includes(host)) {
      // Se reconstruye desde la URL parseada: así se descarta cualquier cosa
      // rara del texto original y se guarda una forma canónica.
      return {
        valid: true,
        link: { provider, url: `${url.origin}${url.pathname}${url.search}` },
      };
    }
  }

  return {
    valid: false,
    reason:
      'Por ahora solo admitimos enlaces de Google Meet (meet.google.com). ' +
      'Crea la reunión en Meet y pega aquí su enlace.',
  };
}

/** Solo para mostrar: `meet.google.com/abc-defg-hij` sin el protocolo. */
export function describeMeetingLink(link: MeetingLink): string {
  try {
    const url = new URL(link.url);
    return `${url.hostname}${url.pathname}`;
  } catch {
    return link.url;
  }
}

/**
 * Lo que se le dice a la persona sobre la grabación, y es lo honesto.
 *
 * CIAN registra el acuerdo; quien graba o no graba dentro de Meet es Google y
 * la persona que maneja la reunión. Decir «imposible grabar sin tu permiso»
 * sería mentir, y en una consulta de salud esa mentira tiene consecuencias.
 */
export const RECORDING_NOTICE =
  'La videollamada ocurre en Google Meet. Tu autorización queda registrada ' +
  'aquí con fecha y hora, y sirve como acuerdo entre ambas partes, pero CIAN ' +
  'no puede impedir técnicamente lo que ocurra dentro de Meet: si alguien ' +
  'graba, lo avisa Meet, no nosotros.';
