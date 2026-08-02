/**
 * Vocabulario de adjuntos.
 *
 * Decisión de fondo de esta fase: **Gemini lee PDF, imágenes y audio de forma
 * nativa**, así que no se extrae texto de un PDF ni se transcribe audio con
 * una biblioteca aparte. El archivo va al modelo tal cual.
 *
 * Eso evita sumar dependencias fuera de la lista autorizada del PRD y da mejor
 * resultado: un PDF conserva su maquetación y una foto de un cuaderno se lee
 * como imagen, no como texto mal reconocido.
 *
 * La excepción es Word: Gemini no lo entiende, así que de ahí sí se saca el
 * texto (ver `extract.ts`), sin dependencias, porque un .docx es un zip.
 */

export const ATTACHMENT_KINDS = ['image', 'pdf', 'audio', 'document'] as const;
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

export const ATTACHMENT_KIND_LABELS: Record<AttachmentKind, string> = {
  image: 'Imagen',
  pdf: 'PDF',
  audio: 'Audio',
  document: 'Documento',
};

type MimeRule = {
  kind: AttachmentKind;
  /** Extensiones habituales, para el selector de archivos. */
  extensions: string[];
  maxBytes: number;
  /** Verdadero si el modelo lo entiende sin convertirlo antes. */
  nativeToModel: boolean;
};

const MB = 1024 * 1024;

/**
 * Tipos admitidos. Es una lista blanca a propósito: aceptar por exclusión
 * abre la puerta a subir cualquier cosa y descubrirlo tarde.
 */
export const SUPPORTED_MIME_TYPES: Record<string, MimeRule> = {
  // --- Imágenes: van al modelo como visión ---------------------------------
  'image/jpeg': { kind: 'image', extensions: ['.jpg', '.jpeg'], maxBytes: 10 * MB, nativeToModel: true },
  'image/png': { kind: 'image', extensions: ['.png'], maxBytes: 10 * MB, nativeToModel: true },
  'image/webp': { kind: 'image', extensions: ['.webp'], maxBytes: 10 * MB, nativeToModel: true },
  'image/heic': { kind: 'image', extensions: ['.heic'], maxBytes: 10 * MB, nativeToModel: true },
  'image/heif': { kind: 'image', extensions: ['.heif'], maxBytes: 10 * MB, nativeToModel: true },

  // --- PDF: nativo, sin extraer texto --------------------------------------
  'application/pdf': { kind: 'pdf', extensions: ['.pdf'], maxBytes: 20 * MB, nativeToModel: true },

  // --- Audio: el modelo transcribe ------------------------------------------
  'audio/webm': { kind: 'audio', extensions: ['.webm'], maxBytes: 20 * MB, nativeToModel: true },
  'audio/ogg': { kind: 'audio', extensions: ['.ogg'], maxBytes: 20 * MB, nativeToModel: true },
  'audio/mpeg': { kind: 'audio', extensions: ['.mp3'], maxBytes: 20 * MB, nativeToModel: true },
  'audio/mp4': { kind: 'audio', extensions: ['.m4a', '.mp4'], maxBytes: 20 * MB, nativeToModel: true },
  'audio/wav': { kind: 'audio', extensions: ['.wav'], maxBytes: 20 * MB, nativeToModel: true },
  'audio/x-wav': { kind: 'audio', extensions: ['.wav'], maxBytes: 20 * MB, nativeToModel: true },

  // --- Texto: se lee tal cual ------------------------------------------------
  'text/plain': { kind: 'document', extensions: ['.txt'], maxBytes: 5 * MB, nativeToModel: false },
  'text/markdown': { kind: 'document', extensions: ['.md'], maxBytes: 5 * MB, nativeToModel: false },

  // --- Word: se extrae el texto ---------------------------------------------
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
    kind: 'document',
    extensions: ['.docx'],
    maxBytes: 5 * MB,
    nativeToModel: false,
  },
};

/** Total por mensaje. Muy por debajo del techo del proveedor, a propósito. */
export const MAX_TOTAL_BYTES_PER_MESSAGE = 30 * MB;

export const MAX_ATTACHMENTS_PER_MESSAGE = 5;

/** Lo que se pone en el `accept` del selector de archivos. */
export const ACCEPT_ATTRIBUTE = [
  ...Object.keys(SUPPORTED_MIME_TYPES),
  ...Object.values(SUPPORTED_MIME_TYPES).flatMap((rule) => rule.extensions),
].join(',');

export function ruleFor(mimeType: string): MimeRule | null {
  // Los navegadores añaden parámetros: `audio/webm;codecs=opus`.
  const base = mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  return SUPPORTED_MIME_TYPES[base] ?? null;
}

export function normalizeMimeType(mimeType: string): string {
  return mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
}

export type ValidationResult =
  | { ok: true; kind: AttachmentKind; mimeType: string }
  | { ok: false; error: string };

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < MB) return `${Math.round(bytes / 1024)} kB`;
  return `${Math.round(bytes / MB)} MB`;
}

/**
 * Criterio de aceptación: «un archivo de tipo no soportado da un mensaje
 * claro, no un error genérico». Por eso el mensaje dice qué se puede subir,
 * no solo que eso no se puede.
 */
export function validateAttachment(
  mimeType: string,
  sizeBytes: number,
  filename: string,
): ValidationResult {
  const normalized = normalizeMimeType(mimeType);
  const rule = ruleFor(normalized);

  if (!rule) {
    const extension = filename.includes('.')
      ? filename.slice(filename.lastIndexOf('.')).toLowerCase()
      : '';

    return {
      ok: false,
      error:
        `No podemos leer archivos ${extension || 'de ese tipo'}. ` +
        'Puedes adjuntar imágenes (JPG, PNG, WEBP), PDF, audio o documentos ' +
        'de Word y de texto.',
    };
  }

  if (sizeBytes <= 0) {
    return { ok: false, error: 'El archivo llegó vacío. Vuelve a intentarlo.' };
  }

  if (sizeBytes > rule.maxBytes) {
    return {
      ok: false,
      error:
        `Ese archivo pesa ${formatBytes(sizeBytes)} y el máximo para ` +
        `${ATTACHMENT_KIND_LABELS[rule.kind].toLowerCase()} es ` +
        `${formatBytes(rule.maxBytes)}.`,
    };
  }

  return { ok: true, kind: rule.kind, mimeType: normalized };
}

export { formatBytes };
