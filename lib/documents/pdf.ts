/**
 * Generador de PDF con la plantilla institucional.
 *
 * Usa las fuentes estándar de `pdf-lib`, sin incrustar tipografías: evita
 * dependencias con binarios y mantiene el archivo ligero. Todo el texto pasa
 * antes por `sanitizeForPdf`, porque esas fuentes lanzan excepción ante
 * cualquier carácter fuera de WinAnsi y el contenido lo escribe un modelo.
 *
 * La paginación es manual y explícita: se mide cada línea, se corta por
 * palabras y se abre página cuando toca. Es más código que delegar en una
 * biblioteca de maquetación, pero cabe en serverless y no arrastra Chromium,
 * que el PRD prohíbe.
 */
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from 'pdf-lib';
import { parseContent, type Block } from './content';
import { sanitizeForPdf } from './winansi';
import {
  DOCUMENT_DISCLAIMER,
  DOCUMENT_TYPE_LABELS,
  ORGANIZATION_NAME,
  type DocumentType,
} from './types';

/** Carta (216 × 279 mm), que es el tamaño de papel usual en México. */
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;

const MARGIN_X = 64;
const MARGIN_TOP = 72;
const MARGIN_BOTTOM = 76;

const INDIGO = rgb(0.106, 0.122, 0.353); // #1B1F5A
const GOLD = rgb(0.788, 0.635, 0.153); // #C9A227
const INK = rgb(0.12, 0.107, 0.086);
const MUTED = rgb(0.36, 0.325, 0.286);

export type PdfDocumentInput = {
  title: string;
  type: DocumentType;
  content: string;
  folio: string;
  /** Nombre del espacio, para el encabezado. */
  tenantName: string;
  createdAt: Date;
};

type Fonts = {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
};

type Cursor = {
  page: PDFPage;
  y: number;
};

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Mexico_City',
  }).format(date);
}

/** Corta un texto en líneas que caben en el ancho dado. */
function wrapText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/).filter((word) => word.length > 0);
  if (words.length === 0) return [];

  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current.length === 0 ? word : `${current} ${word}`;

    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }

    if (current.length > 0) lines.push(current);

    // Una palabra sola más ancha que la caja (una URL larga, por ejemplo):
    // se parte por caracteres antes que desbordar el margen.
    if (font.widthOfTextAtSize(word, size) > maxWidth) {
      let chunk = '';
      for (const character of word) {
        if (font.widthOfTextAtSize(chunk + character, size) > maxWidth) {
          lines.push(chunk);
          chunk = character;
        } else {
          chunk += character;
        }
      }
      current = chunk;
    } else {
      current = word;
    }
  }

  if (current.length > 0) lines.push(current);

  return lines;
}

function drawHeader(page: PDFPage, fonts: Fonts, input: PdfDocumentInput): void {
  const top = PAGE_HEIGHT - MARGIN_TOP;

  page.drawText(sanitizeForPdf(ORGANIZATION_NAME), {
    x: MARGIN_X,
    y: top + 22,
    size: 9,
    font: fonts.bold,
    color: INDIGO,
  });

  page.drawText(sanitizeForPdf(input.tenantName), {
    x: MARGIN_X,
    y: top + 10,
    size: 8,
    font: fonts.regular,
    color: MUTED,
  });

  const folioText = sanitizeForPdf(`Folio ${input.folio}`);
  page.drawText(folioText, {
    x: PAGE_WIDTH - MARGIN_X - fonts.regular.widthOfTextAtSize(folioText, 8),
    y: top + 22,
    size: 8,
    font: fonts.regular,
    color: MUTED,
  });

  const dateText = sanitizeForPdf(formatDate(input.createdAt));
  page.drawText(dateText, {
    x: PAGE_WIDTH - MARGIN_X - fonts.regular.widthOfTextAtSize(dateText, 8),
    y: top + 10,
    size: 8,
    font: fonts.regular,
    color: MUTED,
  });

  // Filete institucional: índigo con acento en oro.
  page.drawRectangle({
    x: MARGIN_X,
    y: top + 2,
    width: PAGE_WIDTH - MARGIN_X * 2,
    height: 1.5,
    color: INDIGO,
  });
  page.drawRectangle({
    x: MARGIN_X,
    y: top + 2,
    width: 56,
    height: 1.5,
    color: GOLD,
  });
}

function drawFooter(
  page: PDFPage,
  fonts: Fonts,
  pageNumber: number,
  totalPages: number,
): void {
  page.drawRectangle({
    x: MARGIN_X,
    y: MARGIN_BOTTOM - 18,
    width: PAGE_WIDTH - MARGIN_X * 2,
    height: 0.75,
    color: rgb(0.85, 0.83, 0.79),
  });

  const disclaimer = sanitizeForPdf(DOCUMENT_DISCLAIMER);
  const lines = wrapText(
    disclaimer,
    fonts.italic,
    7,
    PAGE_WIDTH - MARGIN_X * 2 - 60,
  );

  let y = MARGIN_BOTTOM - 30;
  for (const line of lines) {
    page.drawText(line, {
      x: MARGIN_X,
      y,
      size: 7,
      font: fonts.italic,
      color: MUTED,
    });
    y -= 9;
  }

  const pageLabel = sanitizeForPdf(`${pageNumber} de ${totalPages}`);
  page.drawText(pageLabel, {
    x: PAGE_WIDTH - MARGIN_X - fonts.regular.widthOfTextAtSize(pageLabel, 8),
    y: MARGIN_BOTTOM - 30,
    size: 8,
    font: fonts.regular,
    color: MUTED,
  });
}

/** Alto que ocupa cada tipo de bloque, para decidir el salto de página. */
const BLOCK_STYLE = {
  heading1: { size: 15, leading: 20, before: 18, after: 8, font: 'bold' },
  heading2: { size: 12.5, leading: 17, before: 14, after: 6, font: 'bold' },
  heading3: { size: 11, leading: 15, before: 10, after: 4, font: 'bold' },
  body: { size: 10.5, leading: 15, before: 0, after: 9, font: 'regular' },
} as const;

export async function generatePdf(input: PdfDocumentInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();

  pdf.setTitle(sanitizeForPdf(input.title));
  pdf.setProducer('CIAN');
  pdf.setCreator(ORGANIZATION_NAME);
  pdf.setCreationDate(input.createdAt);

  const fonts: Fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    italic: await pdf.embedFont(StandardFonts.HelveticaOblique),
  };

  const contentWidth = PAGE_WIDTH - MARGIN_X * 2;
  const bottomLimit = MARGIN_BOTTOM + 8;

  const cursor: Cursor = {
    page: pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]),
    y: PAGE_HEIGHT - MARGIN_TOP - 12,
  };

  drawHeader(cursor.page, fonts, input);

  const newPage = () => {
    cursor.page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    cursor.y = PAGE_HEIGHT - MARGIN_TOP - 12;
    drawHeader(cursor.page, fonts, input);
  };

  const ensureSpace = (needed: number) => {
    if (cursor.y - needed < bottomLimit) newPage();
  };

  // --- Portada del documento: tipo y título -------------------------------
  const typeLabel = sanitizeForPdf(
    DOCUMENT_TYPE_LABELS[input.type].toUpperCase(),
  );
  cursor.page.drawText(typeLabel, {
    x: MARGIN_X,
    y: cursor.y,
    size: 8,
    font: fonts.bold,
    color: GOLD,
  });
  cursor.y -= 20;

  const titleLines = wrapText(
    sanitizeForPdf(input.title),
    fonts.bold,
    19,
    contentWidth,
  );
  for (const line of titleLines) {
    ensureSpace(26);
    cursor.page.drawText(line, {
      x: MARGIN_X,
      y: cursor.y,
      size: 19,
      font: fonts.bold,
      color: INDIGO,
    });
    cursor.y -= 25;
  }

  cursor.y -= 12;

  // --- Cuerpo -------------------------------------------------------------
  const blocks: Block[] = parseContent(input.content);

  const drawWrapped = (
    text: string,
    style: (typeof BLOCK_STYLE)[keyof typeof BLOCK_STYLE],
    options: { indent?: number; prefix?: string; color?: typeof INK } = {},
  ) => {
    const indent = options.indent ?? 0;
    const font = fonts[style.font];
    const prefix = options.prefix ? sanitizeForPdf(options.prefix) : '';
    const prefixWidth =
      prefix.length > 0 ? fonts.regular.widthOfTextAtSize(prefix, style.size) + 4 : 0;

    const lines = wrapText(
      sanitizeForPdf(text),
      font,
      style.size,
      contentWidth - indent - prefixWidth,
    );

    cursor.y -= style.before;

    lines.forEach((line, index) => {
      ensureSpace(style.leading);

      if (index === 0 && prefix.length > 0) {
        cursor.page.drawText(prefix, {
          x: MARGIN_X + indent,
          y: cursor.y,
          size: style.size,
          font: fonts.regular,
          color: options.color ?? INK,
        });
      }

      cursor.page.drawText(line, {
        x: MARGIN_X + indent + prefixWidth,
        y: cursor.y,
        size: style.size,
        font,
        color: options.color ?? INK,
      });

      cursor.y -= style.leading;
    });

    cursor.y -= style.after;
  };

  for (const block of blocks) {
    switch (block.kind) {
      case 'heading': {
        const style =
          block.level === 1
            ? BLOCK_STYLE.heading1
            : block.level === 2
              ? BLOCK_STYLE.heading2
              : BLOCK_STYLE.heading3;
        // Un encabezado solo al final de la página queda huérfano.
        ensureSpace(style.leading * 3);
        drawWrapped(block.text, style, { color: INDIGO });
        break;
      }
      case 'paragraph':
        drawWrapped(block.text, BLOCK_STYLE.body);
        break;
      case 'bullet':
        drawWrapped(block.text, BLOCK_STYLE.body, { indent: 14, prefix: '•' });
        break;
      case 'numbered':
        drawWrapped(block.text, BLOCK_STYLE.body, {
          indent: 14,
          prefix: `${block.index}.`,
        });
        break;
      case 'checkbox':
        drawWrapped(block.text, BLOCK_STYLE.body, {
          indent: 14,
          prefix: block.checked ? '[x]' : '[ ]',
        });
        break;
      case 'quote':
        drawWrapped(block.text, BLOCK_STYLE.body, {
          indent: 20,
          color: MUTED,
        });
        break;
      case 'divider':
        ensureSpace(20);
        cursor.page.drawRectangle({
          x: MARGIN_X,
          y: cursor.y + 4,
          width: contentWidth,
          height: 0.75,
          color: rgb(0.85, 0.83, 0.79),
        });
        cursor.y -= 16;
        break;
    }
  }

  // El pie se dibuja al final, cuando ya se sabe el total de páginas.
  const pages = pdf.getPages();
  pages.forEach((page, index) => {
    drawFooter(page, fonts, index + 1, pages.length);
  });

  return pdf.save();
}
