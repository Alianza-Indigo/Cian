/**
 * Interpretación del contenido que escribe el modelo.
 *
 * El modelo entrega Markdown ligero. Aquí se convierte en una estructura
 * plana de bloques que cada generador maqueta a su manera: el PDF dibujando,
 * el DOCX con sus estilos. Así el contenido se escribe una sola vez y se
 * mantiene consistente entre formatos.
 *
 * Es un intérprete deliberadamente pequeño. No aspira a cubrir Markdown
 * completo: cubre lo que aparece en un informe, una carta o una lista de
 * verificación, y trata el resto como párrafo.
 */

export type Block =
  | { kind: 'heading'; level: 1 | 2 | 3; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'bullet'; text: string }
  | { kind: 'numbered'; text: string; index: number }
  | { kind: 'checkbox'; text: string; checked: boolean }
  | { kind: 'quote'; text: string }
  | { kind: 'divider' };

/** Quita el énfasis de Markdown; el estilo lo pone la plantilla, no el texto. */
function stripInlineMarkup(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/(?<!\w)\*(?!\s)(.+?)(?<!\s)\*(?!\w)/g, '$1')
    .replace(/(?<!\w)_(?!\s)(.+?)(?<!\s)_(?!\w)/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\[(.+?)\]\((.+?)\)/g, '$1 ($2)')
    .trim();
}

export function parseContent(raw: string): Block[] {
  const blocks: Block[] = [];
  const lines = raw.replace(/\r\n/g, '\n').split('\n');

  let paragraph: string[] = [];
  let numberedCounter = 0;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const text = stripInlineMarkup(paragraph.join(' '));
    if (text.length > 0) blocks.push({ kind: 'paragraph', text });
    paragraph = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line.length === 0) {
      flushParagraph();
      numberedCounter = 0;
      continue;
    }

    // Separador
    if (/^([-*_])\1{2,}$/.test(line)) {
      flushParagraph();
      blocks.push({ kind: 'divider' });
      continue;
    }

    // Encabezado
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading?.[1] && heading[2]) {
      flushParagraph();
      numberedCounter = 0;
      blocks.push({
        kind: 'heading',
        level: heading[1].length as 1 | 2 | 3,
        text: stripInlineMarkup(heading[2]),
      });
      continue;
    }

    // Casilla de verificación, antes que la viñeta: comparte prefijo.
    const checkbox = /^[-*]\s+\[( |x|X)\]\s+(.*)$/.exec(line);
    if (checkbox?.[2]) {
      flushParagraph();
      blocks.push({
        kind: 'checkbox',
        checked: checkbox[1]?.toLowerCase() === 'x',
        text: stripInlineMarkup(checkbox[2]),
      });
      continue;
    }

    // Viñeta
    const bullet = /^[-*•]\s+(.*)$/.exec(line);
    if (bullet?.[1]) {
      flushParagraph();
      blocks.push({ kind: 'bullet', text: stripInlineMarkup(bullet[1]) });
      continue;
    }

    // Lista numerada
    const numbered = /^(\d+)[.)]\s+(.*)$/.exec(line);
    if (numbered?.[2]) {
      flushParagraph();
      numberedCounter += 1;
      blocks.push({
        kind: 'numbered',
        index: numberedCounter,
        text: stripInlineMarkup(numbered[2]),
      });
      continue;
    }

    // Cita
    const quote = /^>\s?(.*)$/.exec(line);
    if (quote?.[1] !== undefined) {
      flushParagraph();
      blocks.push({ kind: 'quote', text: stripInlineMarkup(quote[1]) });
      continue;
    }

    paragraph.push(line);
  }

  flushParagraph();

  return blocks;
}

/** Texto plano legible, para los formatos sin maquetación. */
export function blocksToPlainText(blocks: Block[]): string {
  const lines: string[] = [];

  for (const block of blocks) {
    switch (block.kind) {
      case 'heading':
        lines.push('', block.text.toUpperCase(), '');
        break;
      case 'paragraph':
        lines.push(block.text, '');
        break;
      case 'bullet':
        lines.push(`  - ${block.text}`);
        break;
      case 'numbered':
        lines.push(`  ${block.index}. ${block.text}`);
        break;
      case 'checkbox':
        lines.push(`  [${block.checked ? 'x' : ' '}] ${block.text}`);
        break;
      case 'quote':
        lines.push(`  "${block.text}"`, '');
        break;
      case 'divider':
        lines.push('', '---', '');
        break;
    }
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
