/**
 * Pruebas de adjuntos.
 *
 * Lo importante aquí es la validación —el criterio pide un mensaje claro ante
 * un tipo no soportado— y la extracción de texto de Word, que es el único
 * formato del que hay que sacar el contenido a mano.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { deflateRawSync } from 'node:zlib';

import {
  MAX_ATTACHMENTS_PER_MESSAGE,
  formatBytes,
  ruleFor,
  validateAttachment,
} from '../lib/attachments/types';
import {
  extractDocxText,
  extractPlainText,
  extractText,
  __docxXmlToTextForTests as docxXmlToText,
} from '../lib/attachments/extract';
import { collectAttachmentIds } from '../lib/attachments/resolve';

const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

describe('validación de adjuntos', () => {
  it('acepta los formatos que el modelo puede leer', () => {
    for (const mime of ['image/jpeg', 'image/png', 'application/pdf', 'audio/webm']) {
      const result = validateAttachment(mime, 1024, 'archivo');
      assert.equal(result.ok, true, `${mime} debería aceptarse`);
      assert.equal(ruleFor(mime)?.nativeToModel, true);
    }
  });

  it('acepta Word y texto, que sí requieren extracción', () => {
    assert.equal(validateAttachment(DOCX_MIME, 1024, 'a.docx').ok, true);
    assert.equal(ruleFor(DOCX_MIME)?.nativeToModel, false);
    assert.equal(validateAttachment('text/plain', 10, 'a.txt').ok, true);
  });

  it('tolera los parámetros que agregan los navegadores', () => {
    // MediaRecorder produce `audio/webm;codecs=opus`.
    const result = validateAttachment('audio/webm;codecs=opus', 2048, 'voz.webm');
    assert.equal(result.ok, true);
  });

  it('rechaza lo no soportado diciendo qué sí se puede subir', () => {
    const result = validateAttachment('application/x-msdownload', 1024, 'virus.exe');
    assert.equal(result.ok, false);
    if (result.ok) return;

    assert.ok(result.error.includes('.exe'));
    // El criterio pide un mensaje claro, no un error genérico.
    assert.ok(/im[aá]genes/i.test(result.error));
    assert.ok(/PDF/i.test(result.error));
  });

  it('rechaza lo que excede el tamaño diciendo cuánto pesa y cuál es el tope', () => {
    const result = validateAttachment('image/png', 50 * 1024 * 1024, 'foto.png');
    assert.equal(result.ok, false);
    if (result.ok) return;

    assert.ok(result.error.includes('50 MB'));
    assert.ok(result.error.includes('10 MB'));
  });

  it('rechaza archivos vacíos', () => {
    assert.equal(validateAttachment('image/png', 0, 'vacio.png').ok, false);
  });

  it('formatea tamaños de forma legible', () => {
    assert.equal(formatBytes(512), '512 B');
    assert.equal(formatBytes(2048), '2 kB');
    assert.equal(formatBytes(5 * 1024 * 1024), '5 MB');
  });

  it('acota cuántos archivos caben en un mensaje', () => {
    assert.ok(MAX_ATTACHMENTS_PER_MESSAGE >= 1);
    assert.ok(MAX_ATTACHMENTS_PER_MESSAGE <= 10);
  });
});

describe('extracción de texto', () => {
  it('lee texto plano', () => {
    const bytes = new TextEncoder().encode('Hola, ¿cómo estás?');
    assert.equal(extractPlainText(bytes), 'Hola, ¿cómo estás?');
  });

  it('quita el BOM que agregan algunos editores', () => {
    const bytes = new TextEncoder().encode('﻿contenido');
    assert.equal(extractPlainText(bytes), 'contenido');
  });

  it('convierte el XML de Word en texto corrido', () => {
    const xml =
      '<w:document><w:body>' +
      '<w:p><w:r><w:t>Primer párrafo</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t>Segundo</w:t></w:r><w:br/><w:r><w:t>con salto</w:t></w:r></w:p>' +
      '</w:body></w:document>';

    const text = docxXmlToText(xml);
    assert.ok(text.includes('Primer párrafo'));
    assert.ok(text.includes('Segundo'));
    assert.ok(text.includes('con salto'));
    assert.ok(!text.includes('<w:'));
  });

  it('decodifica las entidades XML', () => {
    const xml = '<w:p><w:t>Ana &amp; Luis &lt;3</w:t></w:p>';
    assert.equal(docxXmlToText(xml), 'Ana & Luis <3');
  });

  it('lee un .docx real construido a mano', () => {
    // Se arma un zip mínimo con una sola entrada comprimida.
    const xml =
      '<w:document><w:body><w:p><w:r><w:t>Informe escolar</w:t></w:r></w:p></w:body></w:document>';
    const name = Buffer.from('word/document.xml');
    const raw = Buffer.from(xml, 'utf8');
    const compressed = deflateRawSync(raw);

    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0, 6);
    header.writeUInt16LE(8, 8); // deflate
    header.writeUInt32LE(0, 14);
    header.writeUInt32LE(compressed.length, 18);
    header.writeUInt32LE(raw.length, 22);
    header.writeUInt16LE(name.length, 26);
    header.writeUInt16LE(0, 28);

    const zip = Buffer.concat([header, name, compressed]);

    assert.equal(extractDocxText(new Uint8Array(zip)), 'Informe escolar');
  });

  it('devuelve null para lo que el modelo lee por su cuenta', () => {
    const bytes = new Uint8Array([1, 2, 3]);
    assert.equal(extractText('application/pdf', bytes), null);
    assert.equal(extractText('image/png', bytes), null);
    assert.equal(extractText('audio/webm', bytes), null);
  });

  it('devuelve null en vez de reventar con un zip corrupto', () => {
    assert.equal(extractDocxText(new Uint8Array([1, 2, 3, 4, 5])), null);
  });
});

describe('referencias a adjuntos en los mensajes', () => {
  const id = '11111111-2222-4333-8444-555555555555';

  function messageWithFile(url: string) {
    return {
      id: 'm1',
      role: 'user' as const,
      parts: [{ type: 'file' as const, url, mediaType: 'image/png' }],
    };
  }

  it('encuentra los identificadores de nuestras rutas', () => {
    const ids = collectAttachmentIds([
      messageWithFile(`/api/adjuntos/${id}`),
    ] as never);
    assert.deepEqual(ids, [id]);
  });

  it('ignora las URL que no son nuestras', () => {
    const ids = collectAttachmentIds([
      messageWithFile('https://ejemplo.com/foto.png'),
      messageWithFile('data:image/png;base64,AAAA'),
    ] as never);
    assert.deepEqual(ids, []);
  });

  it('no repite un adjunto usado dos veces', () => {
    const ids = collectAttachmentIds([
      messageWithFile(`/api/adjuntos/${id}`),
      messageWithFile(`/api/adjuntos/${id}`),
    ] as never);
    assert.deepEqual(ids, [id]);
  });
});
