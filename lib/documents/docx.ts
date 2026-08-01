/**
 * Generador de DOCX.
 *
 * A diferencia del PDF, aquí no hay que sanear el texto: OOXML es UTF-8 y
 * admite cualquier carácter. Tampoco hay que paginar a mano — de eso se
 * encarga Word al abrir el archivo.
 *
 * El encabezado y el pie se declaran una vez y Word los repite en todas las
 * páginas, incluida la numeración.
 */
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  PageNumber,
  Packer,
  Paragraph,
  TabStopType,
  TextRun,
} from 'docx';
import { parseContent } from './content';
import {
  DOCUMENT_DISCLAIMER,
  DOCUMENT_TYPE_LABELS,
  ORGANIZATION_NAME,
  type DocumentType,
} from './types';

const INDIGO = '1B1F5A';
const GOLD = 'C9A227';
const MUTED = '5C5349';

export type DocxDocumentInput = {
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

function buildHeader(input: DocxDocumentInput): Header {
  return new Header({
    children: [
      new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: 9026 }],
        children: [
          new TextRun({
            text: ORGANIZATION_NAME,
            bold: true,
            size: 18,
            color: INDIGO,
          }),
          new TextRun({ text: `\tFolio ${input.folio}`, size: 16, color: MUTED }),
        ],
      }),
      new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: 9026 }],
        border: {
          bottom: { style: BorderStyle.SINGLE, size: 6, color: INDIGO, space: 4 },
        },
        children: [
          new TextRun({ text: input.tenantName, size: 16, color: MUTED }),
          new TextRun({
            text: `\t${formatDate(input.createdAt)}`,
            size: 16,
            color: MUTED,
          }),
        ],
      }),
    ],
  });
}

function buildFooter(): Footer {
  return new Footer({
    children: [
      new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: 9026 }],
        border: {
          top: { style: BorderStyle.SINGLE, size: 4, color: 'D8D3CC', space: 4 },
        },
        children: [
          new TextRun({
            text: DOCUMENT_DISCLAIMER,
            italics: true,
            size: 14,
            color: MUTED,
          }),
          new TextRun({ text: '\t', size: 14 }),
          new TextRun({ children: [PageNumber.CURRENT], size: 14, color: MUTED }),
          new TextRun({ text: ' de ', size: 14, color: MUTED }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 14, color: MUTED }),
        ],
      }),
    ],
  });
}

function buildBody(input: DocxDocumentInput): Paragraph[] {
  const paragraphs: Paragraph[] = [
    new Paragraph({
      spacing: { after: 60 },
      children: [
        new TextRun({
          text: DOCUMENT_TYPE_LABELS[input.type].toUpperCase(),
          bold: true,
          size: 16,
          color: GOLD,
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 320 },
      children: [
        new TextRun({ text: input.title, bold: true, size: 38, color: INDIGO }),
      ],
    }),
  ];

  for (const block of parseContent(input.content)) {
    switch (block.kind) {
      case 'heading':
        paragraphs.push(
          new Paragraph({
            heading:
              block.level === 1
                ? HeadingLevel.HEADING_1
                : block.level === 2
                  ? HeadingLevel.HEADING_2
                  : HeadingLevel.HEADING_3,
            spacing: { before: 280, after: 120 },
            children: [
              new TextRun({
                text: block.text,
                bold: true,
                color: INDIGO,
                size: block.level === 1 ? 30 : block.level === 2 ? 26 : 23,
              }),
            ],
          }),
        );
        break;

      case 'paragraph':
        paragraphs.push(
          new Paragraph({
            spacing: { after: 160, line: 300 },
            children: [new TextRun({ text: block.text, size: 21 })],
          }),
        );
        break;

      case 'bullet':
        paragraphs.push(
          new Paragraph({
            bullet: { level: 0 },
            spacing: { after: 80, line: 290 },
            children: [new TextRun({ text: block.text, size: 21 })],
          }),
        );
        break;

      case 'numbered':
        paragraphs.push(
          new Paragraph({
            spacing: { after: 80, line: 290 },
            indent: { left: 360, hanging: 260 },
            children: [
              new TextRun({ text: `${block.index}.  `, size: 21 }),
              new TextRun({ text: block.text, size: 21 }),
            ],
          }),
        );
        break;

      case 'checkbox':
        paragraphs.push(
          new Paragraph({
            spacing: { after: 80, line: 290 },
            indent: { left: 360, hanging: 260 },
            children: [
              new TextRun({ text: block.checked ? '[x]  ' : '[  ]  ', size: 21 }),
              new TextRun({ text: block.text, size: 21 }),
            ],
          }),
        );
        break;

      case 'quote':
        paragraphs.push(
          new Paragraph({
            spacing: { after: 160, line: 300 },
            indent: { left: 480 },
            border: {
              left: { style: BorderStyle.SINGLE, size: 12, color: GOLD, space: 12 },
            },
            children: [
              new TextRun({ text: block.text, size: 21, italics: true, color: MUTED }),
            ],
          }),
        );
        break;

      case 'divider':
        paragraphs.push(
          new Paragraph({
            spacing: { before: 160, after: 160 },
            border: {
              bottom: { style: BorderStyle.SINGLE, size: 4, color: 'D8D3CC', space: 4 },
            },
            children: [],
          }),
        );
        break;
    }
  }

  return paragraphs;
}

export async function generateDocx(input: DocxDocumentInput): Promise<Uint8Array> {
  const document = new Document({
    creator: ORGANIZATION_NAME,
    title: input.title,
    description: `${DOCUMENT_TYPE_LABELS[input.type]} generado con CIAN`,
    styles: {
      default: {
        document: {
          run: { font: 'Calibri', size: 21 },
          paragraph: { alignment: AlignmentType.LEFT },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 },
          },
        },
        headers: { default: buildHeader(input) },
        footers: { default: buildFooter() },
        children: buildBody(input),
      },
    ],
  });

  const buffer = await Packer.toBuffer(document);
  return new Uint8Array(buffer);
}
