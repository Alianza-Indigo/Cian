/**
 * Pruebas de la lógica de documentos.
 *
 * Se prueba lo que decide cómo queda un documento: el saneado para PDF, la
 * interpretación del contenido que escribe el modelo y el nombre de archivo.
 * La generación real se verificó aparte, contra pdf-lib y docx.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  findUnencodable,
  isWinAnsiEncodable,
  sanitizeForPdf,
} from '../lib/documents/winansi';
import { blocksToPlainText, parseContent } from '../lib/documents/content';
import { toFileName } from '../lib/documents/types';

describe('saneado para PDF', () => {
  it('conserva intacto todo el español', () => {
    const texto =
      'Señora directora: ¿podría? ¡Sí! niños años corazón más allá ü Ñ «acuerdo» — …';
    assert.equal(sanitizeForPdf(texto), texto);
    assert.deepEqual(findUnencodable(texto), []);
  });

  it('sustituye los símbolos con equivalente', () => {
    assert.equal(sanitizeForPdf('paso ✓ hecho'), 'paso [x] hecho');
    assert.equal(sanitizeForPdf('antes → después'), 'antes -> después');
    assert.equal(sanitizeForPdf('a ● b'), 'a • b');
  });

  it('descarta lo que no tiene equivalente, sin romper el resto', () => {
    const salida = sanitizeForPdf('Hola 🎉 mundo 日本 fin');
    assert.ok(salida.includes('Hola'));
    assert.ok(salida.includes('mundo'));
    assert.ok(salida.includes('fin'));
    assert.ok(!salida.includes('🎉'));
    assert.ok(!salida.includes('日'));
  });

  it('todo lo que sobrevive es codificable', () => {
    const sucio = 'Señora ✓ — «x» … 🎉 → 日本 ¡ok! ​﻿';
    for (const caracter of sanitizeForPdf(sucio)) {
      if (caracter === '\n' || caracter === '\t' || caracter === '\r') continue;
      assert.ok(
        isWinAnsiEncodable(caracter),
        `quedó un carácter no codificable: ${JSON.stringify(caracter)}`,
      );
    }
  });

  it('conserva los saltos de línea', () => {
    assert.equal(sanitizeForPdf('uno\ndos\n\ntres'), 'uno\ndos\n\ntres');
  });

  it('elimina invisibles que descuadran la medición', () => {
    assert.equal(sanitizeForPdf('a​b﻿c'), 'abc');
    assert.equal(sanitizeForPdf('a b'), 'a b');
  });
});

describe('interpretación del contenido', () => {
  it('reconoce encabezados por nivel', () => {
    const bloques = parseContent('# Uno\n## Dos\n### Tres');
    assert.deepEqual(
      bloques.map((b) => b.kind === 'heading' && b.level),
      [1, 2, 3],
    );
  });

  it('distingue casillas de viñetas', () => {
    const bloques = parseContent('- [x] hecho\n- [ ] pendiente\n- normal');
    assert.deepEqual(
      bloques.map((b) => b.kind),
      ['checkbox', 'checkbox', 'bullet'],
    );
    assert.equal(bloques[0]?.kind === 'checkbox' && bloques[0].checked, true);
    assert.equal(bloques[1]?.kind === 'checkbox' && bloques[1].checked, false);
  });

  it('numera las listas por su posición, no por lo que escribió el modelo', () => {
    const bloques = parseContent('1. uno\n1. dos\n1. tres');
    assert.deepEqual(
      bloques.map((b) => (b.kind === 'numbered' ? b.index : null)),
      [1, 2, 3],
    );
  });

  it('quita el énfasis de Markdown, que la plantilla no usa', () => {
    const [bloque] = parseContent('Esto es **importante** y *esto* también');
    assert.equal(
      bloque?.kind === 'paragraph' && bloque.text,
      'Esto es importante y esto también',
    );
  });

  it('junta líneas sueltas en un solo párrafo', () => {
    const bloques = parseContent('una línea\ny su continuación\n\notro párrafo');
    assert.equal(bloques.length, 2);
    assert.equal(
      bloques[0]?.kind === 'paragraph' && bloques[0].text,
      'una línea y su continuación',
    );
  });

  it('reconoce citas y separadores', () => {
    const bloques = parseContent('> una cita\n\n---');
    assert.deepEqual(
      bloques.map((b) => b.kind),
      ['quote', 'divider'],
    );
  });

  it('convierte enlaces en texto legible al imprimirse', () => {
    const [bloque] = parseContent('Ver [la guía](https://ejemplo.mx)');
    assert.equal(
      bloque?.kind === 'paragraph' && bloque.text,
      'Ver la guía (https://ejemplo.mx)',
    );
  });

  it('produce texto plano sin perder la estructura', () => {
    const plano = blocksToPlainText(
      parseContent('# Título\n\n- uno\n- dos\n\n1. primero'),
    );
    assert.ok(plano.includes('TÍTULO'));
    assert.ok(plano.includes('- uno'));
    assert.ok(plano.includes('1. primero'));
  });

  it('no se atraganta con contenido vacío', () => {
    assert.deepEqual(parseContent(''), []);
    assert.deepEqual(parseContent('\n\n  \n'), []);
  });
});

describe('nombre de archivo', () => {
  it('quita acentos y caracteres que rompen cabeceras HTTP', () => {
    assert.equal(
      toFileName('Informe para la Dirección: "urgente"', 'pdf'),
      'informe-para-la-direccion-urgente.pdf',
    );
  });

  it('no deja nombres vacíos', () => {
    assert.equal(toFileName('¿¡...!?', 'docx'), 'documento.docx');
  });

  it('acota la longitud', () => {
    const nombre = toFileName('palabra '.repeat(40), 'txt');
    assert.ok(nombre.length <= 65);
    assert.ok(nombre.endsWith('.txt'));
  });
});
