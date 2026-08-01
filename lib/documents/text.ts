/**
 * Generadores de Markdown y texto plano.
 *
 * No llevan plantilla gráfica, pero sí la misma información institucional:
 * quién lo emite, folio, fecha y descargo. Un documento sin esos datos no
 * sirve para presentarlo en una escuela ni en una institución.
 */
import { blocksToPlainText, parseContent } from './content';
import {
  DOCUMENT_DISCLAIMER,
  DOCUMENT_TYPE_LABELS,
  ORGANIZATION_NAME,
  type DocumentType,
} from './types';

export type TextDocumentInput = {
  title: string;
  type: DocumentType;
  content: string;
  folio: string;
  tenantName: string;
  createdAt: Date;
};

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Mexico_City',
  }).format(date);
}

export function generateMarkdown(input: TextDocumentInput): Uint8Array {
  const parts = [
    `# ${input.title}`,
    '',
    `**${DOCUMENT_TYPE_LABELS[input.type]}** · ${ORGANIZATION_NAME}`,
    '',
    `Folio ${input.folio} · ${formatDate(input.createdAt)} · ${input.tenantName}`,
    '',
    '---',
    '',
    // El contenido ya viene en Markdown: se deja tal cual.
    input.content.trim(),
    '',
    '---',
    '',
    `_${DOCUMENT_DISCLAIMER}_`,
    '',
  ];

  return new TextEncoder().encode(parts.join('\n'));
}

export function generatePlainText(input: TextDocumentInput): Uint8Array {
  const separator = '='.repeat(64);

  const parts = [
    separator,
    input.title.toUpperCase(),
    separator,
    `${DOCUMENT_TYPE_LABELS[input.type]} · ${ORGANIZATION_NAME}`,
    `Folio ${input.folio} · ${formatDate(input.createdAt)}`,
    input.tenantName,
    separator,
    '',
    blocksToPlainText(parseContent(input.content)),
    '',
    separator,
    DOCUMENT_DISCLAIMER,
    separator,
    '',
  ];

  return new TextEncoder().encode(parts.join('\n'));
}
