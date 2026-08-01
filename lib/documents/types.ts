/**
 * Vocabulario de documentos.
 *
 * Sin dependencias, igual que `lib/preferences/types.ts`: lo comparten el
 * esquema de base de datos, los generadores, la tool del orquestador y el
 * navegador.
 */

export const DOCUMENT_TYPES = [
  'informe',
  'carta',
  'solicitud',
  'resumen',
  'guia',
  'lista',
  'checklist',
  'historia_social',
  'material_visual',
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_FORMATS = ['pdf', 'docx', 'md', 'txt'] as const;
export type DocumentFormat = (typeof DOCUMENT_FORMATS)[number];

export const DOCUMENT_STATUSES = ['pending', 'ready', 'failed'] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  informe: 'Informe',
  carta: 'Carta',
  solicitud: 'Solicitud',
  resumen: 'Resumen',
  guia: 'Guía',
  lista: 'Lista',
  checklist: 'Lista de verificación',
  historia_social: 'Historia social',
  material_visual: 'Material visual',
};

/** Qué es cada tipo, en palabras que el modelo pueda usar para elegir. */
export const DOCUMENT_TYPE_HINTS: Record<DocumentType, string> = {
  informe: 'Documento formal que describe una situación, avances u observaciones.',
  carta: 'Comunicación dirigida a una persona o institución, con saludo y despedida.',
  solicitud: 'Petición formal a una institución, con fundamento y petición concreta.',
  resumen: 'Síntesis breve de lo hablado o de un documento más largo.',
  guia: 'Explicación paso a paso de cómo hacer algo.',
  lista: 'Enumeración simple de elementos.',
  checklist: 'Lista con casillas para ir marcando lo cumplido.',
  historia_social:
    'Relato corto en primera persona que anticipa una situación y cómo transcurrirá. Apoyo para personas autistas.',
  material_visual:
    'Material con pasos o conceptos muy breves, pensado para imprimirse y usarse como apoyo visual.',
};

export const DOCUMENT_FORMAT_LABELS: Record<DocumentFormat, string> = {
  pdf: 'PDF',
  docx: 'Word',
  md: 'Markdown',
  txt: 'Texto',
};

export const DOCUMENT_MIME_TYPES: Record<DocumentFormat, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  md: 'text/markdown; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
};

/** Los que llevan plantilla institucional con encabezado, pie y folio. */
export const FORMATS_WITH_TEMPLATE: readonly DocumentFormat[] = ['pdf', 'docx'];

export const ORGANIZATION_NAME = 'Alianza Índigo Neurodivergente A.C.';
export const PLATFORM_NAME = 'CIAN — Centro Integral de Apoyo a la Neurodivergencia';

/**
 * Descargo que va al pie de todo documento generado.
 * Regla 3.6: no es un adorno legal, es parte del producto.
 */
export const DOCUMENT_DISCLAIMER =
  'Documento generado con apoyo de CIAN. No sustituye atención médica, psicológica, terapéutica ni legal.';

export function isDocumentType(value: unknown): value is DocumentType {
  return DOCUMENT_TYPES.includes(value as DocumentType);
}

export function isDocumentFormat(value: unknown): value is DocumentFormat {
  return DOCUMENT_FORMATS.includes(value as DocumentFormat);
}

/** Nombre de archivo seguro, sin acentos ni caracteres que rompan cabeceras. */
export function toFileName(title: string, format: DocumentFormat): string {
  const base = title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .toLowerCase();

  return `${base.length > 0 ? base : 'documento'}.${format}`;
}
